// Reading audio files: whatever the browser can decode (WAV, MP3, AAC/M4A, FLAC, Ogg,
// Opus, WebM, and AIFF/CAF in Safari…), and where it can't, WAV and AIFF read here:
// 8/16/24/32-bit integer, 32/64-bit float, extensible WAV, AIFF and AIFF-C (including
// little-endian "sowt"), uncompressed CAF, and µ-law / A-law. Chrome can't decode AIFF; Safari refuses some
// WAV variants: both come through this way. The parsers are pure (unit-tested).

/** What the file pickers offer: audio of any kind, and video (its sound is used). */
export const AUDIO_ACCEPT = [
  'audio/*', 'video/*',
  '.wav', '.wave', '.bwf', '.aif', '.aiff', '.aifc', '.caf', '.mp3', '.mp2', '.m4a', '.m4b', '.mp4', '.m4v', '.mov',
  '.aac', '.adts', '.alac', '.flac', '.ogg', '.oga', '.opus', '.webm', '.weba', '.mka', '.3gp', '.amr', '.wma', '.au', '.snd',
].join(',');

/** Does a file look like sound (by type or name)? Files with no type get the benefit of the doubt. */
export const looksLikeAudio = (file) => !file.type || /^(audio|video)\//.test(file.type)
  || /\.(wav|wave|bwf|aif|aiff|aifc|caf|mp3|mp2|m4a|m4b|mp4|m4v|mov|aac|adts|alac|flac|ogg|oga|opus|webm|weba|mka|3gp|amr|wma|au|snd)$/i.test(file.name);

const str4 = (v, o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

function ulaw(u) {
  u = ~u & 0xff;
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
  return (u & 0x80 ? 0x84 - t : t - 0x84) / 32768;
}
function alaw(a) {
  a ^= 0x55;
  let t = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) t += 8; else if (seg === 1) t += 0x108; else t = (t + 0x108) << (seg - 1);
  return (a & 0x80 ? t : -t) / 32768;
}

/**
 * Interleaved sample frames to channels. `kind`: 'int' | 'float' | 'ulaw' | 'alaw';
 * `bits` per sample; `little` for byte order.
 */
function readFrames(v, offset, bytes, channels, bits, kind, little) {
  const size = bits / 8;
  const frames = Math.floor(bytes / (size * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  let o = offset;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      let x;
      if (kind === 'float') x = bits === 64 ? v.getFloat64(o, little) : v.getFloat32(o, little);
      else if (kind === 'ulaw') x = ulaw(v.getUint8(o));
      else if (kind === 'alaw') x = alaw(v.getUint8(o));
      else if (bits === 8) x = little ? (v.getUint8(o) - 128) / 128 : v.getInt8(o) / 128; // WAV 8-bit is unsigned
      else if (bits === 16) x = v.getInt16(o, little) / 32768;
      else if (bits === 24) {
        const b0 = v.getUint8(o), b1 = v.getUint8(o + 1), b2 = v.getUint8(o + 2);
        let n = little ? b0 | (b1 << 8) | (b2 << 16) : b2 | (b1 << 8) | (b0 << 16);
        if (n & 0x800000) n -= 0x1000000;
        x = n / 8388608;
      } else x = v.getInt32(o, little) / 2147483648;
      out[c][i] = Number.isFinite(x) ? x : 0;
      o += size;
    }
  }
  return out;
}

/** A WAV (RIFF/RF64) file: {sampleRate, channels: Float32Array[]}, or null if it isn't one we can read. */
export function parseWav(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 12 || !['RIFF', 'RF64'].includes(str4(v, 0)) || str4(v, 8) !== 'WAVE') return null;
  let fmt = null;
  let o = 12;
  while (o + 8 <= v.byteLength) {
    const id = str4(v, o);
    let size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      let format = v.getUint16(o + 8, true);
      if (format === 0xfffe && size >= 40) format = v.getUint16(o + 32, true); // extensible: the sub-format
      fmt = { format, channels: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    } else if (id === 'data' && fmt) {
      if (size === 0xffffffff || o + 8 + size > v.byteLength) size = v.byteLength - o - 8; // RF64 / a truncated file
      const kind = { 1: 'int', 3: 'float', 6: 'alaw', 7: 'ulaw' }[fmt.format];
      if (!kind || !fmt.channels || !fmt.sampleRate || ![8, 16, 24, 32, 64].includes(fmt.bits)) return null;
      return { sampleRate: fmt.sampleRate, channels: readFrames(v, o + 8, size, fmt.channels, fmt.bits, kind, true) };
    }
    o += 8 + size + (size & 1);
  }
  return null;
}

/** An 80-bit IEEE extended float (AIFF's sample rate). */
function extended(v, o) {
  const exp = v.getUint16(o) & 0x7fff;
  const hi = v.getUint32(o + 2);
  const lo = v.getUint32(o + 6);
  if (!exp && !hi && !lo) return 0;
  return (hi * 2 ** -31 + lo * 2 ** -63) * 2 ** (exp - 16383);
}

/** An AIFF or AIFF-C file: {sampleRate, channels}, or null. */
export function parseAiff(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 12 || str4(v, 0) !== 'FORM' || !['AIFF', 'AIFC'].includes(str4(v, 8))) return null;
  let comm = null;
  let ssnd = null;
  let o = 12;
  while (o + 8 <= v.byteLength) {
    const id = str4(v, o);
    const size = v.getUint32(o + 4);
    if (id === 'COMM') {
      comm = { channels: v.getUint16(o + 8), bits: v.getUint16(o + 14), sampleRate: extended(v, o + 16), comp: size >= 22 ? str4(v, o + 26) : 'NONE' };
    } else if (id === 'SSND') {
      ssnd = { offset: o + 16 + v.getUint32(o + 8), size: Math.min(size - 8, v.byteLength - o - 16) };
    }
    o += 8 + size + (size & 1);
  }
  if (!comm || !ssnd || !comm.channels || !comm.sampleRate) return null;
  const c = comm.comp.toLowerCase();
  const [kind, little, bits] = {
    none: ['int', false, comm.bits], twos: ['int', false, comm.bits], sowt: ['int', true, comm.bits], raw: ['int', true, 8],
    fl32: ['float', false, 32], fl64: ['float', false, 64], ulaw: ['ulaw', false, 8], alaw: ['alaw', false, 8],
  }[c.trim()] || [];
  if (!kind) return null;
  const rounded = Math.ceil(bits / 8) * 8; // a 12- or 20-bit file is stored in whole bytes
  if (![8, 16, 24, 32, 64].includes(rounded)) return null;
  // ("raw " is unsigned 8-bit, read like 8-bit WAV.)
  return { sampleRate: Math.round(comm.sampleRate), channels: readFrames(v, ssnd.offset, ssnd.size, comm.channels, rounded, kind, little) };
}

/** A CAF (Core Audio Format) file of linear PCM, µ-law or A-law: {sampleRate, channels}, or null. */
export function parseCaf(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 8 || str4(v, 0) !== 'caff') return null;
  let desc = null;
  let o = 8;
  while (o + 12 <= v.byteLength) {
    const id = str4(v, o);
    const hi = v.getInt32(o + 4);
    let size = hi * 2 ** 32 + v.getUint32(o + 8);
    if (id === 'desc') {
      desc = { sampleRate: v.getFloat64(o + 12), format: str4(v, o + 20), flags: v.getUint32(o + 24), channels: v.getUint32(o + 36), bits: v.getUint32(o + 40) };
    } else if (id === 'data' && desc) {
      if (size < 0 || o + 12 + size > v.byteLength) size = v.byteLength - o - 12; // -1: to the end of the file
      const kind = { lpcm: desc.flags & 1 ? 'float' : 'int', ulaw: 'ulaw', alaw: 'alaw' }[desc.format];
      const bits = kind === 'ulaw' || kind === 'alaw' ? 8 : desc.bits;
      if (!kind || !desc.channels || !desc.sampleRate || ![8, 16, 24, 32, 64].includes(bits)) return null;
      // 8-bit CAF is signed, unlike 8-bit WAV: read it big-endian (signed) whatever the flag says.
      const little = bits > 8 && !!(desc.flags & 2);
      return { sampleRate: Math.round(desc.sampleRate), channels: readFrames(v, o + 16, size - 4, desc.channels, bits, kind, little) };
    }
    if (size < 0) break;
    o += 12 + size;
  }
  return null;
}

/**
 * Decode any audio file's bytes to an AudioBuffer: the browser's decoder first, then the
 * WAV / AIFF readers here. `ctx` is any BaseAudioContext (or none: an offline one is used).
 * Throws an Error whose message says what went wrong.
 */
export async function decodeAudioFile(data, ctx = null) {
  const decoder = ctx || new OfflineAudioContext(1, 1, 44100);
  try {
    return await decoder.decodeAudioData(data.slice(0)); // decoding detaches its input
  } catch { /* try our own readers */ }
  const parsed = parseWav(data) || parseAiff(data) || parseCaf(data);
  if (parsed && parsed.channels[0]?.length) {
    const rate = Math.max(3000, Math.min(768000, parsed.sampleRate));
    const buffer = new AudioBuffer({ length: parsed.channels[0].length, numberOfChannels: Math.min(32, parsed.channels.length), sampleRate: rate });
    parsed.channels.slice(0, 32).forEach((ch, i) => buffer.copyToChannel(ch, i));
    return buffer;
  }
  throw new Error('This browser can\'t decode that format');
}
