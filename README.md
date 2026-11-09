# arp-seq

A syncable **arpeggiator** feeding a **2–6 step sequencer** that changes the pitch and
volume of each arpeggiated note. It runs in the browser (Web Audio + Web MIDI) and has
no dependencies.

```sh
npm start        # serves http://localhost:8080 (ES modules and Web MIDI need http, not file://)
npm test         # unit tests for the arp, sequencer and clock logic (Node 18+)
npm run bump     # bump the ?v= stamp on asset URLs; do this before each release
```

## How it works

```
held notes ──► ARPEGGIATOR ──► note ──► SEQUENCER step n ──► pitch + offset, velocity × volume ──► synth / MIDI out
                  ▲                             (n advances by one for every arp note, wrapping at length 2–6)
             clock (internal or MIDI clock in)
```

### Arpeggiator
- **Modes:** Up, Down, Up/Down, Down/Up, Random (never the same note twice in a row), As Played
- **Rate:** 1/4, 1/8D (dotted 8th), 1/8, 1/8T, 1/16, 1/16T, 1/32, placed on a 24 PPQN grid so rate changes stay in time
- **Octaves:** 1–4 · **Gate:** 5–100% · **Swing:** 0–75% (delays off-beat steps)
- **Latch:** keeps notes after you let go; a new chord replaces them. The sustain pedal (CC64) also toggles latch.
- **Tempo:** 20–300 BPM, with tap tempo

### Arp voices (west-coast style)
The arp has two monophonic voices: **Oscillator 1**, and **Oscillator 2**, which plays the sequence as-is or inverted. Each voice is a complex oscillator feeding a low-pass gate:
- **Timbre** folds the sine core (a triangle wavefolder). At 0 it's a pure sine; turning it up adds bright, glassy harmonics.
- **Shape** crossfades between the folded sine and a second **Wave**: Saw, Square, Triangle, Spike (a narrow pulse) or Sine.
- **Gate**, with three modes:
  - **Combo** strikes a vactrol-style low-pass gate. **Cutoff** sets brightness, loudness *and* how long the note rings (from ~40 ms closed to ~2.5 s fully open), so there's no separate decay control. The arp's Gate time doesn't affect it.
  - **VCA** works the same way without the filter.
  - **LP** is filter only: the note holds for exactly the arp's Gate time.
- **Resonance** for the gate's filter.
- **Mod → Osc 1** (in Oscillator 2's panel): oscillator 2 modulates oscillator 1 with **AM** or **FM**, using its own pitch for each step (Same/Inverted, Transpose, Detune) and its own Wave.
  - **Depth** is the AM amount, or the FM index (0–8).
  - Off-step tail slides move the modulator too.
  - It still works with oscillator 2 switched Off, which makes oscillator 2 a silent modulator.
- **Sync cutoff** (Oscillator 2, on by default): Oscillator 1's Cutoff drives both voices.
- **Monophonic:** each new note on a voice cuts off that voice's previous note, with a 3 ms fade so there's no click. Chords stay polyphonic.

### Sync
- **Internal:** a look-ahead scheduler on the audio clock, kept running in background tabs by a Worker timer. Pressing a key starts the transport.
- **MIDI Clock In:** follows 0xF8 ticks and Start/Continue/Stop, and shows the tempo it detects. *Play* starts it by hand for sources that never send Start.
- **Send MIDI clock:** sends clock plus Start/Stop to the selected MIDI output when running on the internal clock.

### Progression (meta sequencer)
- Program **1–8 chords**. Each slot has a root, a chord type (Maj, min, min7, maj7, 7, dim, sus4, or Rest) and a length of 1–8 beats. The progression loops, locked to the clock (internal or MIDI clock in).
- The current chord feeds the **arpeggiator** (and oscillator 2) and the **chord rhythm** layer. Keys or chord pads you hold are **added** to it.
- **On** starts the transport. Stop and Play restart the progression from slot 1.
- **Octave** sets the chord register. **Preset** loads I–V–vi–IV, ii–V–I, I–vi–ii–V, i–VI–III–VII or i–iv–v–i.
- Edits take effect on the next clock pulse, so you can change chords while it plays.

### Chord rhythm
A separate layer that repeats the **held chord** in a Euclidean rhythm while the arpeggiator (and oscillator 2) keep playing on top.
- **Steps** (2–16), **Hits** and **Rotate**: the hits are spread as evenly as possible over the steps. For example, 3 in 8 = `x..x..x.`. A dot display shows where the pattern is.
- **Rate:** the chord layer has its own rate, separate from the arp's (default 1/8). It runs on the same clock.
- **Sound:** two oscillators per chord note, **Wave 1** and **Wave 2** (default Saw and Square), with an equal-power **Blend** and **Detune 2** (±50 cents) for thickness. Also octave (±2), gate and level, plus an optional MIDI out channel.
- **PWM:** a chord wave set to Square becomes a variable-width pulse. **Width** sets it (5–95%), and a shared triangle LFO sweeps it by **PWM depth** at **PWM rate**. DC offset is removed so off-center widths don't thump.
- **Sub** (Off / Square / Sine, with its own level): one octave below the chord's lowest note. It goes through the chord filter but skips the chorus, so the bass stays tight.
- **Gate arp:** the arp plays only while the chord pattern is on a hit. With the defaults (chord at 1/8, arp at 1/16), each hit lets two arp notes through. The arp and sequencer hold their place during rests. Works even with the chord layer turned off.
- **Filter:** the chords have their own low-pass **Cutoff** and **Resonance**, separate from the main filter.
- **Chorus:** a two-voice stereo chorus on the chords only, with **Mix**, **Rate** and **Depth** controls.
- **Follow sequencer:** off by default, so the chord repeats unchanged. When on, the chord takes the pitch offset and volume of the step the arp is on. It never moves the sequencer forward.

### Percussion
Three kits, all synthesized live with Web Audio (no samples). Each kit remembers its own pattern, preset and mutes.
- **Latin:** in the style of a 70s preset rhythm box (below).
- **808-style:** a long pitch-swept boom kick, a two-tone snare with noise, a multi-burst clap, rim, toms and cowbell, metallic hats and a cymbal from the 808's six square oscillators at their original pitches (the closed hat chokes the open one). The open hat and cymbal are tuned against reference 808 recordings: a ~0.7 s open hat centred around 8 kHz, and a bright splash over a darker 2–5 kHz ring that lasts about 3 s, plus its Latin section: low/mid/hi congas, claves and maracas. Presets: Electro, Boom Bap, House, Half-time, and all seven Latin rhythms. On the 808 the bongos move to the higher congas and the guiro to the maracas.
- **Linn-style:** a tight, clicky kick, a crisp snare, clap, hats, tambourine, cabasa, tom and cowbell. Presets: Synth Pop, Funk, Ballad, New Wave. It's a synthesized take on that early-80s character; the original machine used recorded samples.

- **Your samples:** twelve rows (Kick, Snare, Rimshot, Clap, Closed HH, Open HH, Tom Hi, Tom Lo, Tamb, Cabasa, Cowbell, Cymbal) that you fill with your own recordings, such as your own drum machine.
  - Loading: **Load samples…** (or drop a folder's worth of files on the grid) matches each file to a row by the **first three letters** of its name: KIC/BAS → Kick, SNA → Snare, RIM/SID/SST → Rimshot, CLA → Clap, CHH/CLO/HHC/HIH → Closed HH, OHH/OPE/HHO → Open HH, TOM+H/L → toms, TAM, CAB, COW, CRA/RID/CYM. Short codes like BD, SD or CH1 work too, and a prefix shared by the whole batch (e.g. "LinnDrum " or "LD_") or a track number is skipped first. Unrecognised files fill empty rows; drop a single file on a row to replace it.
  - Hi-hats: names with the word open or closed after it ("Hat Open", "HH Closed") go by that word.
  - **Sample mixer** (under the buttons): shows which file is on each row and lets you put any loaded file on any row, swapping with what was there, or empty a row. Each row also has a **Level** (0–150%, double-click for 100%) and a **Tune** (±12 semitones in 0.1 steps, double-click for 0). Tune changes playback speed like the hardware's tuning knobs, so tuning down also lengthens the sound.
  - Storage: samples are kept in this browser only (IndexedDB) and never uploaded or committed.
  - Playback: the closed hat chokes the open hat, and accents play louder. The Linn-style patterns come mapped onto these rows.

**Variation** (all kits):
- **Trig conditions:** set **Tap sets** to *Conditions*, pick one, and tap hits to give them that condition (tap again to clear).
  - **A:B** plays on the A-th of every B loops of that row (1:2, 2:2 … 4:4, 1:8, 8:8).
  - **Fill / Not fill** follow the fill bars. **First / Not first** refer to the first loop after Play.
  - **25 / 50 / 75%** are chance.
- **Row length** (the menu at the end of each row, 1–16): a shorter row loops sooner and drifts against the others (polymeter). Its conditions count its own loops.
- **Fill every 2 / 4 / 8 bars** turns on the last bar of each cycle (the light shows it). **Add fill** writes a snare/tom build on the last beat that plays only in fill bars.

The Latin kit:
- **Voices:** bass drum, conga low and high, bongo low and high, claves, cowbell, maracas and guiro
- **Rhythms:** Bossa Nova, Samba, Cha-Cha, Mambo, Rhumba, Beguine and Tango. Each is a one-bar, 16th-note pattern written from the standard groove of its style.
- **Editing:** tap a cell to cycle off → hit → accent, which makes the pattern "Custom". Tap a voice name to mute it.
- **Timing:** follows the clock (internal or MIDI clock) and the swing setting. Turning it on starts the transport, so it can play on its own.
- **Level**, plus optional **MIDI out** as General MIDI drum notes (usually channel 10)

### Sequencer
- **Length:** 2 to 6 steps
- **Each step:** a **pitch** offset of ±24 semitones (slider, ±1 / ±12 buttons, double-click resets to 0) and its own **volume** of 0–100%, which scales the note's velocity. 0% mutes the step, but the step still counts.
- **On/Off per step.** An Off step strikes nothing: it's a rest that still takes its turn, so the arp and sequencer move on. If the note before is still ringing, as Combo/VCA strikes can, the tail slides to the note the Off step would have played (the next arp note plus its offset) with a fast glide instead of a new strike. Oscillator 2 slides to its own version of that note, per its Same/Inverted setting. MIDI out gets only the rest.
- Each arpeggiated note moves the sequencer one step. A new chord resets both the arp and the sequencer to the start.

### Oscillator 2
- A second voice plays on every arpeggiated note, using the same sequencer step as oscillator 1:
  - **Same:** plays the step's offset as it is (doubles the sequence)
  - **Inverted:** plays the offset flipped around the arp note, so +12 becomes −12 and +7 becomes −7
- Its own **wave**, **transpose** (±24 semitones), **detune** (±50 cents) and **level**. It also follows each step's volume.
- **MIDI Out Ch:** can send oscillator 2 to its own MIDI channel, so it can drive a second synth.
- Each step card shows the offset oscillator 2 will play for that step.

### Chord pads
- **Maj, min, min7, maj7** pads play a whole chord into the arpeggiator while you hold them (keys `1`–`4` work too). The chord is built on the **Root** you pick, in the keyboard's current octave.
- With **Latch** on, tap a pad and the chord keeps playing. Tapping another pad switches chords.
- Pads, keys and MIDI can all be used together. A note shared by two of them keeps sounding until both let go.

### Breakbeat slicer
A drum break cut into slices and re-sequenced tracker style, for jungle, drum & bass and breakbeat.
- **Slicing:** **Equal** (8, 16 or 32 slices), or **On the hits**. Transient detection finds each kick, snare and hat (up to 32) and starts each slice just before the hit's attack. **Sensitivity** sets how many hits count: low gives only the big ones, high includes ghost notes.
- **Break:** **Load break…** (or drop one on the waveform), or use the built-in synthesized **Demo break**. Your break is kept in this browser only.
- **Tempo:** **Break is** sets its length (1, 2 or 4 bars). **Fit to tempo** speeds it up or slows it down to the current BPM (and the pitch moves with it, the classic sound). **Pitch** adds an offset.
- **Pattern:** 16 or 32 steps of 16ths. Each row has:
  - **Slice:** an empty row lets the previous slice keep playing, as in a tracker.
  - **Vol**, and **Pitch** (±12).
  - **C (Chance):** 0–100% that the row plays. When it doesn't, the previous slice plays on.
  - **R (Roll):** divides the step into 0–16 retriggers. Types: **R** regular, **Rv**/**RV** volume down/up, **Rn**/**RN** a semitone down/up per hit, **RR** random notes.
  - **FX:** Reverse or Cut.
- **In order** places each slice on the 16th nearest where it falls in the break, so hit-sliced breaks still play back as recorded.
- **Editing:** select a row and click a slice in the waveform to put it there; the selection moves to the next row, and you hear the slice. **In order**, **Chop** (a jungle-style rearrangement), **Randomize** and **Clear** fill the pattern.
- **Mixing:** it plays on the drum bus, so the drum delay/reverb sends apply. It has its own **Level** and follows the clock and swing.

### Effects
A shared delay and reverb, with a **send** from each source (Arp, Chords, Drums) into each one.
- **Delay:** **Time** synced to the tempo (1/16 – 1/2, including dotted and triplet values; it follows tempo changes and MIDI clock). **Feedback** sets each echo's level relative to the last. **Tone** darkens the repeats, and **Ping-pong** bounces echoes left/right.
- **Reverb:** convolution with a generated, decorrelated stereo tail that darkens as it decays. **Size** is the time to −60 dB (0.3–8 s), plus **Pre-delay** and **Tone**.

### Input / output
- On-screen keyboard (click and drag), computer keys `A W S E D F T G Y H U J K O L P ;`, `Z`/`X` to change octave, `Space` to play or stop
- MIDI in, with a channel filter or omni
- Built-in synth (wave, cutoff, volume) and/or MIDI out on any channel, timestamped for tight timing
- Cutoff sliders are logarithmic (60 Hz – 12 kHz), so each octave gets the same slider travel and the low end has more room
- **Looks:** **System 7** (the default), or the modular faceplate in **Light**, **Dark** or **Auto** (Auto follows your system setting). The theme is applied before the page draws, so there's no flash.
  - **System 7** is a black-and-white classic-Mac homage: a menu bar, pinstriped windows with close boxes, rounded buttons that invert, pop-up menus, X checkboxes, dithered scroll-bar sliders and dither patterns instead of color.
  - It uses a locally installed "Chicago" font if you have one (Chrome and Firefox; Safari only exposes system fonts). Otherwise titles fall back to Pixelify Sans. Small text uses the CC BY Geneva 9 recreation; see `fonts/README.md` for credits.
- Settings are saved in `localStorage`

## Layout
| File | Purpose |
| --- | --- |
| `src/core.js` | The arp pattern builder and the arp+sequencer engine (pure, tested) |
| `src/clock.js` | Internal and external (MIDI) clocks, and pulse→step conversion with swing (pure, tested) |
| `src/synth.js` | Polyphonic Web Audio synth |
| `src/midi.js` | Web MIDI I/O |
| `mac.css`, `fonts/` | System 7 theme and its bitmap font |
| `src/breaks.js` | Breakbeat slicer: tempo fit, slices, tracker rows, player (logic tested) |
| `src/fx.js` | Delay and reverb (timing and impulse-response math tested) |
| `src/samples.js` | Stores your own drum samples in the browser |
| `src/percussion.js` | Percussion voices, rhythm presets and pattern helpers (patterns tested) |
| `src/app.js` | UI wiring |
