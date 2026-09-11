/** Browser media only: delegation is owned by the server sideband. */
export class LiveTransport {
  private peer?: RTCPeerConnection;
  private microphone?: MediaStream;
  private events?: RTCDataChannel;
  private lifecycle = new AbortController();
  private closed?: () => void;
  constructor(private audio: HTMLAudioElement, private onState: (state: 'listening' | 'error' | 'idle', message?: string) => void) {}
  async start(createSession: (sdp: string, signal: AbortSignal) => Promise<string>) {
    const signal = this.lifecycle.signal;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires HTTPS or localhost.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (signal.aborted) { stream.getTracks().forEach(t => t.stop()); signal.throwIfAborted(); }
    this.microphone = stream;
    const peer = this.peer = new RTCPeerConnection();
    peer.ontrack = ({ track }) => { this.audio.srcObject = new MediaStream([track]); void this.audio.play().catch(() => { this.audio.hidden = false; this.onState('listening', 'Press play below to hear the assistant.'); }); };
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'failed' && !signal.aborted) this.onState('error', 'Voice connection failed. Please try again.'); };
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    this.events = peer.createDataChannel('oai-events');
    let started!: () => void;
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Voice connection timed out.')), 30_000);
      started = () => { clearTimeout(timer); resolve(); };
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
    });
    // Register rejection immediately while SDP/ICE setup is in flight.
    void ready.catch(() => {});
    this.events.onmessage = ({ data }) => {
      let event: { type: string }; try { event = JSON.parse(data); } catch { return; }
      if (event.type === 'session.started') { started(); this.onState('listening'); }
      if (event.type === 'session.closed') { this.closed?.(); if (!signal.aborted) this.onState('idle'); }
    };
    this.events.onclose = () => { this.closed?.(); if (!signal.aborted) this.onState('error', 'Voice connection closed. Please try again.'); };
    await peer.setLocalDescription(await peer.createOffer());
    await new Promise<void>((resolve, reject) => {
      const clean = () => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', check); signal.removeEventListener('abort', abort); };
      const check = () => { if (peer.iceGatheringState === 'complete') { clean(); resolve(); } };
      const abort = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
      const timer = setTimeout(() => { clean(); reject(new Error('Network negotiation timed out.')); }, 10_000);
      peer.addEventListener('icegatheringstatechange', check); signal.addEventListener('abort', abort, { once: true }); check();
    });
    signal.throwIfAborted();
    const sdp = peer.localDescription?.sdp; if (!sdp) throw new Error('No microphone connection offer.');
    const answer = await createSession(sdp, signal); signal.throwIfAborted();
    await peer.setRemoteDescription({ type: 'answer', sdp: answer }); await ready;
  }
  async stop() {
    // Stop microphone capture immediately; retain the transport briefly for session.closed.
    this.microphone?.getTracks().forEach(t => t.stop());
    if (this.events?.readyState === 'open') await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 3000); this.closed = () => { clearTimeout(timer); resolve(); };
      this.events!.send(JSON.stringify({ type: 'session.close' }));
    });
    this.dispose();
  }
  dispose() { this.lifecycle.abort(); this.microphone?.getTracks().forEach(t => t.stop()); this.events?.close(); this.peer?.close(); this.audio.srcObject = null; this.audio.hidden = true; }
}
