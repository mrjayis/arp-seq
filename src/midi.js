// Thin wrapper around the Web MIDI API: device lists, input routing, timed output.

export class Midi {
  constructor({ onMessage, onDevicesChanged }) {
    this.onMessage = onMessage;
    this.onDevicesChanged = onDevicesChanged;
    this.access = null;
    this.input = null;
    this.output = null;
    this.outChannel = 0; // 0-15
    this.sounding = new Map(); // note -> pending note-on count
  }

  get supported() {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async init() {
    if (!this.supported) return false;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      return false;
    }
    this.access.onstatechange = () => this.onDevicesChanged?.();
    this.onDevicesChanged?.();
    return true;
  }

  get inputs() {
    return this.access ? [...this.access.inputs.values()] : [];
  }

  get outputs() {
    return this.access ? [...this.access.outputs.values()] : [];
  }

  selectInput(id) {
    if (this.input) this.input.onmidimessage = null;
    this.input = this.inputs.find((i) => i.id === id) || null;
    if (this.input) this.input.onmidimessage = (e) => this.onMessage?.(e.data, e.timeStamp);
  }

  selectOutput(id) {
    this.allNotesOff();
    this.output = this.outputs.find((o) => o.id === id) || null;
  }

  /** `at` is a performance.now() timestamp in ms (or undefined for "now"). */
  send(bytes, at) {
    if (this.output) this.output.send(bytes, at);
  }

  noteOn(note, vel, at) {
    if (!this.output) return;
    this.sounding.set(note, (this.sounding.get(note) || 0) + 1);
    this.send([0x90 | this.outChannel, note, vel], at);
  }

  noteOff(note, at) {
    if (!this.output) return;
    this.send([0x80 | this.outChannel, note, 0], at);
    // Keep tracking the note until its note-off has actually gone out.
    const wait = at === undefined ? 0 : Math.max(0, at - performance.now());
    setTimeout(() => {
      const left = (this.sounding.get(note) || 1) - 1;
      if (left > 0) this.sounding.set(note, left);
      else this.sounding.delete(note);
    }, wait + 5);
  }

  clock(at) {
    this.send([0xf8], at);
  }

  allNotesOff() {
    if (!this.output) return;
    this.output.clear?.(); // drop queued (future) messages where supported
    for (const n of this.sounding.keys()) this.output.send([0x80 | this.outChannel, n, 0]);
    this.sounding.clear();
    this.output.send([0xb0 | this.outChannel, 123, 0]);
  }
}
