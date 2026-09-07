# Tonada example projects

Two self-contained, editable projects. All instruments are synthesized: these files need no external audio, sample packs, or network access after loading Tonada.

| Project | Key | Tempo | Arrangement |
| --- | --- | --- | --- |
| [After Hours · Classic House](classic-house.tonada.json) | A minor | 124 BPM | 32 bars, approximately 62 seconds before effect tails |
| [Velvet Blue · Ambient Soul](ambient-soul.tonada.json) | D dorian | 76 BPM | 24 bars, approximately 76 seconds before effect tails |

## Open and play

1. Open Tonada and select **Projects → Import project**.
2. Choose either `.tonada.json` file from this directory. Import creates a new local project; it does not overwrite your work.
3. Press **Play** to hear the opening editor pattern. For the full arrangement, change the transport's **Play** dropdown from **Pattern** to **Song**. Turn **Loop** off for a single pass.
4. Use the pattern selector below the editor to explore the variations. Instruments and track mixes are saved independently for each pattern.
5. To create an audio file, choose **Export audio → Entire song → Render WAV**.

## After Hours · Classic House

Four-on-the-floor kick, a synthesized clap, offbeat hats, rubbery bass and garage-style organ chords. A minor–F major–G major–A minor harmony supports seventh-chord stabs and a short bell motif. Swing is 13%, with light seeded humanization.

Five editable patterns form the song:

**Doors open → Warehouse groove → Warehouse groove → Open the room → Organ break → Open the room → Open the room → Last dancers**

The editor opens on **Warehouse groove** so the complete sound is immediately available. Song playback starts with the drum-and-bass introduction.

## Velvet Blue · Ambient Soul

An instrumental ambient-soul sketch with warm FM electric piano, seventh/ninth voicings, a soft sub, restrained backbeat and shaker, a breathy melodic answer and long pad tails. Harmony moves through D minor, G major and C major colors within D dorian. Swing is 26%, with gentle seeded humanization.

Four editable patterns form the song:

**Velvet keys → Velvet keys → Weightless → A quiet conversation → A quiet conversation → Into the blue**

The center section removes the drums; the closing pattern leaves space for the keys, melody and reverb. There are no recorded vocals.

## Reproduce the files

Run `bun scripts/generate-examples.ts` from the repository root. It builds both arrangements, validates their documents and scale membership, verifies the JSON import checksums, and writes stable example files. Browser smoke tests in `tests/examples.spec.ts` import and render the complete songs and check finite, bounded output. Musical balance remains a listening judgment.
