import type { Sample, Project } from './document';
import { LIMITS } from './validation';
export async function decodeSample(
  blob: Blob,
  name: string,
  p: Project,
  origin = 'file',
): Promise<Sample> {
  if (p.samples.length >= LIMITS.samples) throw new Error('Maximum 16 samples per project.');
  if (blob.size > LIMITS.sampleBytes) throw new Error('Audio file exceeds 16 MiB.');
  const c = new AudioContext();
  let buffer: AudioBuffer;
  try {
    buffer = await c.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await c.close();
  }
  if (buffer.duration > LIMITS.captureSeconds)
    throw new Error('Samples may be at most 30 seconds long.');
  const used = p.samples.reduce((n, s) => n + s.channels.length * s.channels[0]!.length * 4, 0);
  if (used + Math.min(2, buffer.numberOfChannels) * buffer.length * 4 > LIMITS.sampleBytes)
    throw new Error('Project sample storage limit is 16 MiB.');
  let start = buffer.length,
    end = 0,
    peak = 0;
  for (let ch = 0; ch < Math.min(2, buffer.numberOfChannels); ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]!);
      peak = Math.max(a, peak);
      if (a > 0.002) {
        start = Math.min(start, i);
        end = Math.max(end, i);
      }
    }
  }
  if (!peak || start >= end) throw new Error('No audible signal found.');
  start = Math.max(0, start - 128);
  end = Math.min(buffer.length, end + 129);
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, ch) =>
    Array.from(buffer.getChannelData(ch).slice(start, end), (v) => (v / peak) * 0.98),
  );
  const length = channels[0]!.length / buffer.sampleRate;
  return {
    id: crypto.randomUUID(),
    name: name.slice(0, 100),
    rate: buffer.sampleRate,
    channels,
    root: detectRoot(channels[0]!, buffer.sampleRate),
    start: 0,
    end: length,
    loop: false,
    loopStart: 0,
    loopEnd: length,
    origin,
  };
}
export function detectRoot(data: number[], rate: number) {
  const count = Math.min(4096, data.length >> 1);
  let best = 0,
    lag = 0;
  for (let shift = Math.floor(rate / 1000); shift < Math.min(rate / 50, count); shift++) {
    let dot = 0,
      a = 0,
      b = 0;
    for (let i = 0; i < count; i++) {
      const x = data[i]!,
        y = data[i + shift]!;
      dot += x * y;
      a += x * x;
      b += y * y;
    }
    const score = dot / Math.sqrt(a * b || 1);
    if (score > best) {
      best = score;
      lag = shift;
    }
    if (score > 0.97) break;
  }
  return best > 0.65
    ? Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(rate / lag / 440))))
    : 60;
}
export class Capture {
  recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  async start(onComplete: (blob: Blob) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: BlobPart[] = [];
    try {
      this.recorder = new MediaRecorder(this.stream);
      this.recorder.ondataavailable = (e) => chunks.push(e.data);
      this.recorder.onstop = () => {
        const type = this.recorder?.mimeType || 'audio/webm';
        this.dispose();
        onComplete(new Blob(chunks, { type }));
      };
      this.recorder.start();
      this.timer = setTimeout(() => this.stop(), LIMITS.captureSeconds * 1000);
    } catch (e) {
      this.dispose();
      throw e;
    }
  }
  stop() {
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }
  dispose() {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.recorder) {
      this.recorder.onstop = null;
      this.recorder.ondataavailable = null;
    }
    this.recorder = null;
  }
}
