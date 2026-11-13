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

### Scenes
- **Save scene** stores everything as it is now under a name: all the sounds, the arp sequence, mono sequence, progression, drum and break patterns in every slot, the song chain, mixer levels and effects. **Recall** brings it all back. **Update** overwrites a scene with the current state, and **Rename** and **Delete** do what they say. The scene you last saved or recalled is outlined.
- **Recall is live:** while playing, the scene comes in on the next bar's downbeat without stopping (its row blinks while it waits). When stopped it applies at once. **Undo recall** switches back the same way.
- Not part of a scene: the look (theme), which windows are folded, MIDI ports and clock source, master volume, the built-in synth switch and the keyboard octave and chord root, since those belong to the device or the moment. Your drum samples and loaded break are stored once in the browser rather than in each scene, so a scene uses whichever ones are loaded.
- Scenes live in this browser. **Export…** downloads them all as a file, as a backup or to move them to another device. **Import…** adds the scenes from such a file to the ones you have.

### Song mode
Make the drums and break move through sections instead of looping one bar.
- **Pattern slots A–D** (in the Percussion and Breakbeat windows): you edit the selected slot. A new slot starts as a copy of the one you were on, ready to vary, and **Copy to…** duplicates the current slot. Each drum kit keeps its own slots.
- **Song** window: a chain of bars, one slot per bar (e.g. A A B A C C B D), built with **+A … +D**. Click a bar to change its slot, × to remove it. With Song on, each bar plays its slot in both windows and the chain loops, with the playing bar lit. With Song off you hear the slot you're editing.

### Arpeggiator
- **Level:** the overall level of the arpeggiator, both voices together (Oscillator 2 keeps its own level on top). It doesn't change the MIDI it sends.
- **On / Off:** switches the arp's sound (both voices, and its MIDI out). While off, the arp and sequencer keep stepping silently in time, so the sequencer display moves and chords or a pad set to Follow sequencer still follow it. The readout shows "(arp off)".
- **Modes:** Up, Down, Up/Down, Down/Up, Random (never the same note twice in a row), As Played
- **Rate:** 1/4D (dotted quarter), 1/4, 1/8D (dotted 8th), 1/8, 1/8T, 1/16D (dotted 16th), 1/16, 1/16T, 1/32, placed on a 24 PPQN grid so rate changes stay in time
- **Octaves:** 1–4 · **Gate:** 5–100% · **Swing:** 0–75% (delays off-beat steps)
- **Latch:** keeps notes after you let go; a new chord replaces them. The sustain pedal (CC64) also toggles latch.
- **Tempo:** 20–300 BPM, with tap tempo

### Mono synth (101-style)
- **Little keyboard:** two octaves under the steps for writing the sequence directly. Tap a key and it goes in at the cursor, with no need to arm Write. Legato, Rest, Tie and Back work with it as usual. **−** and **+** move it by an octave (C0 to C8). While the sequence plays, the key of the note now sounding is marked.
A monophonic bass/lead voice with its own step sequencer, playing in time with everything else.
- **Voice:**
  - **Oscillator:** Saw, Pulse (Width, plus PWM from the LFO), Sub (−1 oct square, −2 oct square or −2 oct narrow pulse) and Noise, each with its own level.
  - **Filter:** a 24 dB resonant low-pass with Cutoff, Resonance, Env amount and Key follow.
  - **Envelope and VCA:** ADSR envelope; the VCA follows the envelope or acts as a simple gate.
  - **Modulation:** LFO for vibrato and filter wobble. **Portamento** Off / On / Auto (Auto glides only into legato steps).
- **Writing a sequence (up to 64 steps):** arm **Write** and play notes on the Keyboard window, computer keys or MIDI. Each note fills the next step, and the arpeggiator is left alone while Write is armed.
  - **Rest** adds silence, **Tie** holds the previous note, and with **Legato** on, notes slide in without retriggering.
  - **Back** deletes, and clicking a step writes from there.
- **Playing:** **Rate** (default 1/16), **Gate**, **Transpose**, and **Keys transpose**: the keys you play shift the sequence live, with C3 meaning no change.
- **Output:** **Level**, Bass sends in the Effects window, and an optional MIDI out channel.

### Arp voices (west-coast style)
The arp has two monophonic voices: **Oscillator 1**, and **Oscillator 2**, which plays the sequence as-is or inverted. Each voice is a complex oscillator feeding a low-pass gate:
- **Timbre** folds the sine core (a triangle wavefolder). At 0 it's a pure sine; turning it up adds bright, glassy harmonics.
- **Shape** crossfades between the folded sine and a second **Wave**: Saw, Square, Triangle, Spike (a narrow pulse) or Sine.
- **Gate**, with three modes:
  - **Combo** strikes a vactrol-style low-pass gate. **Cutoff** sets brightness, loudness *and* how long the note rings (from ~40 ms closed to ~2.5 s fully open), so there's no separate decay control. The arp's Gate time doesn't affect it.
  - **VCA** works the same way without the filter.
  - **LP** is filter only: the note holds for exactly the arp's Gate time.
- **Resonance** for the gate's filter.
- **Attack** and **Release** (shared by both oscillators): Attack is how quickly each note fades in. Release adds tail: on top of the ring in Combo/VCA, or as the fade after the gate in LP. At their minimums the voices sound as before.
- **Mod → Osc 1** (in Oscillator 2's panel): oscillator 2 modulates oscillator 1 with **AM** or **FM**, using its own pitch for each step (Same/Inverted, Transpose, Detune) and its own Wave.
  - **Depth** is the AM amount, or the FM index (0–8).
  - Off-step tail slides move the modulator too.
  - It still works with oscillator 2 switched Off, which makes oscillator 2 a silent modulator.
- **Sync cutoff** (Oscillator 2, on by default): Oscillator 1's Cutoff drives both voices.
- **Monophonic:** each new note on a voice cuts off that voice's previous note, with a 3 ms fade so there's no click. Chords stay polyphonic.

### Sync
- **Tuning** (Clock window): **Equal** is ordinary tuning. **Just (5-limit)** and **Just (7-limit)** are *adaptive* just intonation. Every pitched synth (both arp voices, the AM/FM modulator, chord rhythm, pad, sub, FM sounds and the mono synth) is retuned chord by chord to pure ratios. The notes are *sweetened* together: each one has a few pure-ratio choices (a whole step can be 9/8 or 10/9, a minor 7th 9/5 or 16/9, and so on), and the tuning picks the combination that beats least across the whole chord and anything else sounding with it. Arp, mono and held notes outside the chord are then fitted to what's already sounding: major thirds 5/4 (−13.7 cents), minor thirds 6/5 (+15.6), fifths 3/2 (+2), and so on. The chord is the progression's current chord, or with the progression off the root is worked out from the keys you hold, in any inversion. With the progression on, each chord's root is itself tuned to a pure ratio above the key's tonic (worked out from the whole progression), so neighbouring chords keep their shared notes still: in C → Am, the C and E don't move. The tonic stays on its equal-tempered pitch, so nothing drifts. Diminished chords are built from two pure minor thirds. Held pad notes, a held (tied) mono note and a ringing arp note or tail (both oscillators, and the AM/FM modulator) glide to their new tuning when the chord changes, without retriggering, and syncopated early chords are tuned to their own root. **7-limit** also uses the "barbershop" 7th (7/4, −31 cents) and a 7/5 tritone. MIDI out stays in equal temperament.
- **Pure** (with Just tuning, on by default): removes the deliberate detuning that makes even perfectly tuned notes beat: Detune 2, Osc 2's detune, the FM sounds' detuned layers and vibrato, the mono synth's vibrato, and the chord chorus. Your settings for those are kept and come back when Pure is off or the tuning is Equal.
- **Key** (with Just tuning): the home note that chord roots are tuned against. **Auto** works out the key from the whole progression: the major or minor scale that fits its chords best, preferring a key whose home chord is in it, so ii–V–I comes out in C. Set it yourself to override that. A set key also applies with the progression off, to chords you hold, and it moves along with Modulate.
- **Readout:** the display at the top shows the **Tuning**, the **Key** it's anchored to ("(auto)" when it comes from the progression), and the **Chord** it's following now, with how far that chord's root is tuned from equal temperament (e.g. **Am −15.6¢**).
- **Humanize** (Clock window): loosens the quantization of every section. Notes land a little early or late, within ±20 ms at 100% but never more than a fifth of a step, so fast notes keep their order. Levels vary by up to ±25%. Each section is moved on its own, and every drum hit and chord note gets its own variation, so the parts don't drift together. It applies to the arp, chord rhythm, mono synth, percussion (MIDI out included) and breakbeat. At 0 everything is exactly on the grid.
- **Internal:** a look-ahead scheduler on the audio clock, kept running in background tabs by a Worker timer. Pressing a key starts the transport.
- **MIDI Clock In:** follows 0xF8 ticks and Start/Continue/Stop, and shows the tempo it detects. *Play* starts it by hand for sources that never send Start.
- **Send MIDI clock:** sends clock plus Start/Stop to the selected MIDI output when running on the internal clock.

### Progression (meta sequencer)
- Program **1–8 chords**. Each slot has a root, a chord type (Maj, min, min7, maj7, 7, dim, sus4, or Rest) and a length of 1–8 beats. The progression loops, locked to the clock (internal or MIDI clock in).
- **Inversions:** each slot also has an inversion: **Root**, **1st**, **2nd** or **3rd** (for four-note chords). An inverted chord shows its bass note as a slash chord, e.g. G/B.
- **Register:** each slot can also be moved **Oct −2** to **Oct +2** from the progression's Octave, for example a low C, then F an octave up. With Smooth or Nearest-tones voicing, the chord is voiced as usual and then moved, so it lands exactly that many octaves away.
- **Modulate:** changes key every **1–8 rounds** (a round is once through the progression), **by** a half step, whole step, minor or major 3rd, 4th or 5th, up or down. The steps add up, so +2 every round goes C → D → E → F♯…, but the total is folded back within a tritone of the written key (−5 to +6), so it never drifts out of range. That means some changes go down instead of up, for example the 5th key in that example drops to G♯ below. The header shows the current key. Everything that plays the progression follows: the arp, chord rhythm, pad, sub, and Syncopate's early chords (which use the key of the round they push into). With **All synths** on (the default), the other synths change key too: the Mono Synth sequence, and any keys you hold or latch for the arp and chords. Turn it off to keep those in the written key. Stop and Play start again from the written key.
- **Voicing:** **As set** plays each chord in the inversion you picked. **Smooth (inversions)** keeps the first chord as set, then gives every later chord the inversion (in its octave or the one below) that moves the voices least from the chord before. C–G–Am–F becomes C – G/B – Am/C – F/C. The inversion menus then show what was chosen, and the loop voices the same way every time.
  - **Nearest tones** goes further: each voice of the previous chord moves to the closest tone of the next one, in any octave, so voicings can open out instead of staying in close position. When a 7th chord adds a voice, the new tone goes wherever it moves least. Voices stay within about an octave and a half of the first chord, notes never double, and ties go to the narrower voicing. ii–V–I (Dm7–G7–Cmaj7) becomes D F A C → D F G B → C E G B. With plain triads it often lands on the same chords as Smooth, which is already the shortest move there.
- The current chord feeds the **arpeggiator** (and oscillator 2) and the **chord rhythm** layer. Keys or chord pads you hold are **added** to it.
- **On** starts the transport. Stop and Play restart the progression from slot 1.
- **Octave** sets the chord register. **Preset** loads I–V–vi–IV, ii–V–I, I–vi–ii–V, i–VI–III–VII or i–iv–v–i.
- Edits take effect on the next clock pulse, so you can change chords while it plays.

### Chord rhythm
A separate layer that repeats the **held chord** in a Euclidean rhythm while the arpeggiator (and oscillator 2) keep playing on top.
- **Mode: Rhythm / Pad.** Rhythm plays the Euclidean hits below. **Pad** holds the chord, always on, for as long as there are notes (keys, latch or the progression). When the chord changes, only the notes that change fade out and swell in; shared notes carry on. **Attack** and **Release** set the swell and the tail. It uses the same voice, sub, filter and chorus.
- **Sound: Analog / FM E.Piano / FM Pad.** Analog is the two-wave voice with PWM and filter. The FM sounds are DX7-style: sine operators frequency-modulating each other, without the filter (its controls grey out). Sub, Level and Chorus still apply.
  - **FM E.Piano:** a 1:1 "body" pair whose brightness fades as the note rings, plus a 14:1 "tine" pair that gives the metallic strike. Notes decay on their own, low notes longer than high ones. **Brightness** sets the modulation depth (softer playing is darker too), **Tine** the strike, and **Decay** how long middle C rings. In Rhythm mode the end of the Gate damps the note, so a long Gate lets it ring.
  - **FM Pad:** three slightly detuned operator pairs (body, an octave up, and a 3:1 shimmer) whose brightness swells in with the note, with a gentle vibrato that eases in. It works best in Pad mode, where **Attack** and **Release** shape it and Follow sequencer glides it like the analog pad. **Brightness** sets how glassy it gets.
- **Steps** (2–16), **Hits** and **Rotate**: the hits are spread as evenly as possible over the steps. For example, 3 in 8 = `x..x..x.`. A dot display shows where the pattern is.
- **Rate:** the chord layer has its own rate, separate from the arp's (default 1/8). It runs on the same clock.
- **Syncopate:** with the progression on, a chord hit on or after the last 8th note before the next chord plays that next chord early, pushing it ahead of the beat the way players anticipate a change. With C–G and a hit on the "and" of 4, that hit is already G. It only applies to hits that land there, so a rhythm with nothing in the last 8th is unchanged. Inversions, voice leading and keys you hold all apply to the pushed chord. It's for Rhythm mode; a pad changes on the beat.
- **Tie over** (with Syncopate): the early chord holds over the bar line instead of being struck again. If the rhythm also hits the downbeat, the first early hit lasts until the end of that downbeat hit's gate, and neither the downbeat nor any other early hit in between is re-struck. If there's no downbeat hit, the early chord plays its normal gate.
- **Sound:** two oscillators per chord note, **Wave 1** and **Wave 2** (default Saw and Square), with an equal-power **Blend** and **Detune 2** (±50 cents) for thickness. Also octave (±2), gate and level, plus an optional MIDI out channel.
- **PWM:** a chord wave set to Square becomes a variable-width pulse. **Width** sets it (5–95%), and a shared triangle LFO sweeps it by **PWM depth** at **PWM rate**. DC offset is removed so off-center widths don't thump.
- **Sub** (Off / Square / Sine, with its own level): one octave below the chord's lowest note. It goes through the chord filter but skips the chorus, so the bass stays tight.
- **Gate arp:** the arp plays only while the chord pattern is on a hit. With the defaults (chord at 1/8, arp at 1/16), each hit lets two arp notes through. The arp and sequencer hold their place during rests. Works even with the chord layer turned off.
- **Filter:** the chords have their own low-pass **Cutoff** and **Resonance**, separate from the main filter.
- **Chorus:** a two-voice stereo chorus on the chords only, with **Mix**, **Rate** and **Depth** controls.
- **Follow sequencer:** off by default, so the chord repeats unchanged. When on, the chord takes the pitch offset and volume of the step the arp is on. It never moves the sequencer forward. In **Pad** mode the held chord slides to each step instead of re-striking: **Glide** (pad row) sets how long the slide takes, from a near-instant jump to a slow 1 s bend, and a step at 0% volume fades the pad out until the next step.

### Score player
- **Load MIDI…** (or drop .mid files on the window) adds Standard MIDI Files to the **Piece** menu. They're kept in this browser. **Remove** takes the chosen piece off the list and **Clear all** removes every one (each asks you to click twice). Public-domain MIDI of Bach's two-part Inventions, chorales and much more is at mutopiaproject.org.
- Each part (a track, or a channel in a single-track file) gets its own synth: **Arp voice** (the west-coast voice, one note at a time), **Mono synth**, **Chord synth** (the chord layer's analog or FM sound, which can play chords), or **Off**. By default the first part goes to the arp voice and the second to the mono synth, which suits a two-part invention. One-note-at-a-time voices play each note until the next begins.
- It plays in time with the clock, starting on the next bar, alongside everything else. **Speed** (½× to 2×) plays it slower or faster against the tempo, **Use its tempo** sets the tempo written in the file, **Transpose** moves it ±24 semitones, and **Play** sets what happens at the end: **This piece once**, **Loop this piece**, or a playlist of every piece in the menu, **all in order** (going round again after the last) or **shuffled**. Each piece starts on the bar line where the last one ended, and the status shows which one of how many is playing. Humanize and Solo apply as usual (each part is in the section of the synth it plays on).
- **Just tuning** sweetens the score too. With no progression or held keys, the notes sounding together in the score are the chord it tunes to, so the two hands of an invention are tuned to each other.

### Percussion
- **What's playing:** while it plays, the grid shows how the current bar differs from the pattern on screen. That covers **Evolve**'s changes and, in Song mode, a different slot. Added hits get a dot and outline, dropped hits are greyed out with a slash, and hits at a different level get a small dot. Stop clears the marks.
Three kits, all synthesized live with Web Audio (no samples). Each kit remembers its own pattern, preset and mutes.
- **Latin:** in the style of a 70s preset rhythm box (below).
- **808-style:** a long pitch-swept boom kick, a two-tone snare with noise, a multi-burst clap, rim, toms and cowbell, metallic hats and a cymbal from the 808's six square oscillators at their original pitches (the closed hat chokes the open one). The open hat and cymbal are tuned against reference 808 recordings: a ~0.7 s open hat centred around 8 kHz, and a bright splash over a darker 2–5 kHz ring that lasts about 3 s, plus its Latin section: low/mid/hi congas, claves and maracas. Presets: Electro, Boom Bap, House, Half-time, and all seven Latin rhythms. On the 808 the bongos move to the higher congas and the guiro to the maracas.
- **Linn-style:** a tight, clicky kick, a crisp snare, clap, hats, tambourine, cabasa, tom and cowbell. Presets: Synth Pop, Funk, Ballad, New Wave. It's a synthesized take on that early-80s character; the original machine used recorded samples.

- **Your samples:** twelve rows (Kick, Snare, Rimshot, Clap, Closed HH, Open HH, Tom Hi, Tom Lo, Tamb, Cabasa, Cowbell, Cymbal) that you fill with your own recordings, such as your own drum machine.
  - Loading: **Load samples…** (or drop a folder's worth of files on the grid) matches each file to a row by the **first three letters** of its name: KIC/BAS → Kick, SNA → Snare, RIM/SID/SST → Rimshot, CLA → Clap, CHH/CLO/HHC/HIH → Closed HH, OHH/OPE/HHO → Open HH, TOM+H/L → toms, TAM, CAB, COW, CRA/RID/CYM. Short codes like BD, SD or CH1 work too, and a prefix shared by the whole batch (e.g. "LinnDrum " or "LD_") or a track number is skipped first. Unrecognised files fill empty rows; drop a single file on a row to replace it.
  - Hi-hats: names with the word open or closed after it ("Hat Open", "HH Closed") go by that word.
  - **Sample mixer** (under the buttons): shows which file is on each row and lets you put any loaded file on any row, swapping with what was there, or empty a row. Each row also has a **Level** (0–150%, double-click for 100%) and a **Tune** (±12 semitones in 0.1 steps, double-click for 0). Tune changes playback speed like the hardware's tuning knobs, so tuning down also lengthens the sound.
  - **Mixer** (Latin, 808 and Linn kits): the same **Level** (0–150%) and **Tune** (±12 semitones) per sound, remembered per kit. Tuning a synthesized sound scales every frequency in it (oscillators, sweeps and filters), so a cowbell goes up an octave at +12. **Reset mixer** puts the kit back to 100% and no tuning.
  - Storage: samples are kept in this browser only (IndexedDB) and never uploaded or committed.
  - Playback: the closed hat chokes the open hat, and accents play louder. The Linn-style patterns come mapped onto these rows.

**Variation** (all kits):
- **Trig conditions:** set **Tap sets** to *Conditions*, pick one, and tap hits to give them that condition (tap again to clear).
  - **A:B** plays on the A-th of every B loops of that row (1:2, 2:2 … 4:4, 1:8, 8:8).
  - **Fill / Not fill** follow the fill bars. **First / Not first** refer to the first loop after Play.
  - **25 / 50 / 75%** are chance.
- **Row length** (the menu at the end of each row, 1–16): a shorter row loops sooner and drifts against the others (polymeter). Its conditions count its own loops.
- **Evolve** (0–100%): each bar, a few ordinary hits are nudged a step, dropped, or joined by ghost notes on busy rows. Accents never change, and neither does your saved pattern; each Play starts a fresh variation.
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
- **Switching slices off:** **Shift-click** (or **long-press**, on a touch screen) a slice in the waveform to switch it off, and again to switch it back on. It's hatched in the waveform and its rows in the tracker are struck through. While off it never plays: rows that use it act like empty rows, so the previous sound (or roll) carries on. **Evolve** and **Randomize** never pick it. Off slices are saved, but they reset if the slicing changes the number of slices.
- **Roll until next** (on by default): like the Polyend Tracker, a roll keeps retriggering through the empty rows after it until the next filled row (a slice or a Cut), wrapping round the pattern. **R** is the retriggers per 16th step: **1** = 16th notes, **2** = 32nds, **4** = 64ths (0 = no roll). Volume and note rolls ramp across the whole run, so Rv on a row followed by three empty ones fades out over all four. Note rolls stay within ±24 semitones. Chance is decided once, on the row itself. Rows the roll is carrying through are tagged **roll…** while they play. Turn it off for rolls that fill only their own step.
- **What's playing:** with **Evolve** on, a row it changed shows a tag with what played instead: **→7** (slice 7), **R3** (a roll), **rev**. Each tag stays until that row comes round again, and Stop clears them.
- **Trim:** use only part of the loaded file. Drag near either edge of the overview strip, or use the **Start** and **End** sliders; the parts that are cut off are drawn faint. The trimmed part is what gets sliced, played and fitted to the tempo, with tiny fades at the cuts so they don't click. **Whole file** undoes it. The trim is saved with your break and in scenes. Loading a new file starts untrimmed.
- **Break is:** how many bars the loaded (trimmed) break is, from **1 to 16**, so a 6-bar break is fitted to the tempo correctly. If the pattern is shorter than the break and still in order, it's lengthened to fit. **Steps** goes up to 128 (8 bars).
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
- **Evolve** (0–100%): each loop, a few rows get a different slice, an extra roll or a reverse, and the odd slice lands on an empty row. Your pattern itself isn't changed.
- **Mixing:** it plays on the drum bus, so the drum delay/reverb sends apply. It has its own **Level** and follows the clock and swing.

### Effects
A shared delay and reverb, with a **send** from each source (Arp, Chords, Drums) into each one.
- **Delay:** **Time** synced to the tempo (1/16 – 1/2, including dotted and triplet values; it follows tempo changes and MIDI clock). **Feedback** sets each echo's level relative to the last. **Tone** darkens the repeats, and **Ping-pong** bounces echoes left/right.
- **Reverb:** convolution with a generated, decorrelated stereo tail that darkens as it decays. **Size** is the time to −60 dB (0.3–8 s), plus **Pre-delay** and **Tone**.

### Input / output
- **MIDI Learn** (button at the top): every control you can assign gets a dashed outline. Click one (it blinks), then move a knob, fader or button on your controller, and that CC (on its channel) now drives the control. Click an armed control again to remove its mapping; **Clear all** removes every mapping; **Done** or Esc finishes. Mapped controls keep a ring around them, and their tooltip shows the CC.
  - **Sliders** follow the CC across their whole range, and **menus** step through their choices.
  - **Checkboxes** and **On/Off** switches turn on at 64 and up.
  - **Other buttons** (Latch, Tap, Rest, a sequencer length…) press when the CC goes past 64, so a controller button triggers them.
  - Mappings are saved on this device and don't change with scenes. A mapped CC is used only for its control.
- **MIDI In per module** (Sound & MIDI window): each module can be played live from its own MIDI channel. A channel set for a module goes only to that module. **Arp** (first in the row) plays the keyboard and arpeggiator: **Omni** gets every channel no other module has claimed, a channel number takes just that channel, and **Off** has the arp ignore MIDI.
  - **Chord synth:** plays live and polyphonically with the chord layer's analog or FM sound, holding until you let go. Just tuning sweetens what you hold.
  - **Mono synth:** last-note priority, like the real thing. Overlapping notes slide (legato), and letting go of the top note goes back to the one still held.
  - **Percussion:** General MIDI drum notes (36 kick, 38 snare, 42 closed hat…) play the current kit's matching sounds, with its mixer levels and tuning.
  - **Breakbeat:** C1 (note 36) plays slice 1, C♯1 slice 2, and so on, for finger-drumming the break.
  - All notes off (CC 123/120) silences a module, and so does switching its channel off.
  - **Aftertouch** (on by default, with a **Depth**): polyphonic aftertouch shapes each note you press into. Keyboards that only send channel pressure work too, with the pressure applying to every held note.
    - **Chord synth:** each pressed note's own filter opens (up to two octaves at full depth) and gets a little louder. FM sounds get brighter and more bell-like instead.
    - **Mono synth:** the filter opens, following the note that's sounding.
    - **Arp:** pressing into a held key makes the arp notes that come from it louder and brighter.
- On-screen keyboard (click and drag), computer keys `A W S E D F T G Y H U J K O L P ;`, `Z`/`X` to change octave, `Space` to play or stop
- MIDI in, with a channel filter or omni
- Built-in synth (wave, cutoff, volume) and/or MIDI out on any channel, timestamped for tight timing
- Cutoff sliders are logarithmic (60 Hz – 12 kHz), so each octave gets the same slider travel and the low end has more room
- **Looks:** **System 7** (the default), or the modular faceplate in **Light**, **Dark** or **Auto** (Auto follows your system setting). The theme is applied before the page draws, so there's no flash.
  - **System 7** is a black-and-white classic-Mac homage: a menu bar, pinstriped windows with close boxes, rounded buttons that invert, pop-up menus, X checkboxes, dithered scroll-bar sliders and dither patterns instead of color.
  - It uses a locally installed "Chicago" font if you have one (Chrome and Firefox; Safari only exposes system fonts). Otherwise titles fall back to Pixelify Sans. Small text uses the CC BY Geneva 9 recreation; see `fonts/README.md` for credits.
- **Sticky bar:** Play/Stop, Tempo and Tap stay at the top while you scroll, next to a jump chip for every window. A chip opens its window if folded and scrolls to it; a dot marks modules that are switched on.
- **Window order:** Clock and Keyboard first, then the arp (Arpeggiator, Sequencer, both voices), chords (Progression, Chord Rhythm), Mono Synth, drums (Percussion, Breakbeat, Song), and Effects and MIDI.
- **Touch:** double-tapping never zooms the page, so quick taps on buttons and cells register as taps. Pinch-zoom and scrolling still work.
- **Confirming:** buttons that erase something (mono **Clear**, **Clear samples**, a scene's **Update** and **Delete**) ask by turning into "Sure? …" for three seconds; click again to go ahead. Scene **Rename** edits the name in place (Enter saves, Esc cancels). There are no pop-up dialogs, because those freeze the page and would stop the music.
- **Help:** the explanations in each window are hidden to keep things compact. **Help** (top of the page) shows them all, and **Hide help** hides them again. The choice is remembered on this device. Hovering a control still shows its tooltip.
- **Collapsible windows:** click a window's title (or the triangle; in System 7, the close box) to fold it down to its header, which keeps its On button and main controls where it has them. **Collapse all / Expand all** are in the menu bar, and folded windows stay folded next visit.
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
| `src/evolve.js` | Per-bar, non-destructive variation for drums and breaks (tested) |
| `src/mono.js` | Mono synth voice and its step-sequencer logic (tested) |
| `src/fx.js` | Delay and reverb (timing and impulse-response math tested) |
| `src/samples.js` | Stores your own drum samples in the browser |
| `src/percussion.js` | Percussion voices, rhythm presets and pattern helpers (patterns tested) |
| `src/app.js` | UI wiring |

## Solo

The Arpeggiator (both voices), Chord Rhythm (with its pad and sub), Mono Synth, Percussion and Breakbeat windows each have an **S** button. In System 7 it sits at the right of the title bar. Solo one or more to hear only those. Their delay and reverb sends go quiet too, but echoes already ringing still finish. Alt-click solos a section on its own. The button still shows when a window is folded, and solo isn't saved: a fresh load starts with everything audible.
