# Tonada verification and implementation boundaries

## Reproducibility

Engine/content version `1.0.0`, document schema `1`, PRNG stream version `v1`. Seed text is normalized to Unicode NFC, trimmed, and case-preserved; blank input uses `crypto.randomUUID()` and stores the result. A defined 32-bit hash seeds Mulberry32 integer arithmetic. Progression, noise, reverb and humanization use separate streams. Musical randomness never reads wall time, frame time or `Math.random()`.

Every summing junction is explicitly ordered with at most two inputs. This is necessary: direct multi-input Web Audio fan-in produced last-bit differences during browser testing. Offline nodes remain connected until rendering completes; realtime voice summing links and voice nodes are removed after their envelopes end. Realtime and offline use the same engine and event conversion.

The committed reports identify the browser build used. Repeated renders and project export/import are compared sample-for-sample, not by a lossy file hash. Corpus checksums hash IEEE-754 channel-zero samples with FNV-1a; the 200 fixtures vary mode, tonic, tempo, swing and humanization. Corpus rate is 22,050 Hz to keep regression time low; user exports offer 44,100 and 48,000 Hz. Floating-point reproducibility across browsers or browser versions is not promised.

## Musical conventions

Modes are stored explicitly in `MODES`, including ascending melodic minor. Pitched input is locked by scale degree; percussion note numbers identify drum rows. Toggling lock is lossless. Chromatic notes are retained and marked, while new locked input is quantized into the scale.

The progression generator uses a deliberately small, documented modal grammar: begin on degree I, choose I or IV for interior heptatonic bars, close V–I. For pentatonic/blues collections, interior degree II and closure III–I use scale-stacked triads rather than imposing chromatic major/minor harmony. Interior repeats/returns are allowed. These are modal cadence conventions, not a claim that every mode has a classical major dominant. Inversions/octave placements minimize summed three-voice motion and reject outer parallel fifths/octaves. Tests cover 1,000 seeds per mode (12,000 total).

Swing delays odd subdivisions by 0–65% of a sixteenth note without rewriting notes. Humanization uses triangular timing displacement bounded by ±24 ticks and uniform velocity displacement bounded by ±0.12, both scaled by the amount. Velocity is clamped to 0.01–1.

## Audio bounds and measured checks

The master has 6 dB internal headroom, bus compression, a 20 Hz DC-blocker and a mandatory sample limiter with an absolute ceiling of 0.89 (approximately −1 dBFS). Resonance is limited to Q=12 and delay feedback to 0.75. Preset sound quality and limiter transparency still require listening.

Voice limits are 16 per track and 64 globally. Release-stage voices are stolen before sounding voices, oldest first, using a 5 ms gain ramp and a 6 ms source stop. The overload fixture uses 200 notes, maximum track levels/resonance and sends, and measures adjacent-sample discontinuity below 0.3 at 44,100 Hz. The pitch fixture permits ±2 cents around A4. ADSR tests measure the voice output before the dynamic bus compressor using local RMS windows and filter/gain tolerances. Master-chain pitch, peak, DC and overload are tested separately. Noise-filter spectral centroids must increase across 400/1,800/7,000 Hz cutoffs. Mean DC tolerance is 0.001. All measured samples must be finite and stay below the limiter ceiling.

## Local data limits

- 8 tracks plus chord track; 64 patterns; 1–8 bars per pattern; 64 song slots.
- 16,384 stored notes per project.
- 16 samples; 16 MiB total decoded Float32 PCM; at most 2 channels and 30 seconds per sample.
- 100 MiB project JSON import maximum.
- 180 seconds maximum offline render, including envelope/reverb tails and delay repeats down to −80 dB; WAV buffers remain in browser memory until the dialog is replaced.
- 64 undo levels; immutable PCM arrays are shared between edit snapshots to avoid multiplying sample memory.

Saves are serialized per project, commit metadata and the complete revision in one IndexedDB transaction, and retain one previous revision. Saved is displayed only after commit. Web Locks prevent another tab from writing the same project. Failed saves preserve the current session, keep the unsaved state, and permit manual retry and JSON export through Help. Schema 1 is the first published format; there are no legacy schemas to migrate. Unsupported schemas/engine versions are rejected without changing storage. Import always creates a new identity and retains the source ID.

## Timing boundary

Lookahead scheduling cannot reconstruct sound during a main-thread stall longer than the already scheduled window. Tonada pauses the musical phase at the committed boundary and resumes from that boundary without bursting overdue notes. This preserves event order but introduces an audible gap and shifts subsequent wall-clock timing. Therefore the spec's stronger demand of no dropped *or misplaced* audio through an arbitrarily long stall is not claimed; meeting it requires an independent scheduling thread/worklet or scheduling the entire piece ahead, which changes the requested architecture/live-edit tradeoff.

Tempo edits apply at the first uncommitted tick boundary. The playhead reads the audio clock. Room decay/pre-delay/division/feedback changes take effect on the next playback; track balance, pan, sends, drive and focused voice cutoff/resonance use parameter ramps in the live graph. Other voice changes apply to subsequently scheduled notes. These update boundaries are explicit limitations relative to fully live changes to every sounding voice.

## Remaining release verification

The included tests establish implementation behavior, not a blanket claim that every acceptance bullet in the specification has been independently audited. Still outstanding:

- Human listening: preset quality, ease of making a satisfying phrase, speaker/headphone balance and limiter transparency.
- Physical microphone permission/capture testing across supported desktop browsers; automated coverage uses local generated-file import.
- Long-duration browser/GPU memory profiling and manual screen-reader/200% text-zoom review across browsers.
- Cross-browser audio measurements. Current sample equality reports apply only to the browser build recorded in the reports.
- The strongest stall behavior and fully live envelope/LFO/room editing described above remain architectural limitations.

Web MIDI is optional in the specification and is not implemented. MIDI file export is implemented. The UI includes native keyboard controls and scale-aware entry; it is desktop-oriented, with narrow-window scrolling rather than a touch-first editor.
