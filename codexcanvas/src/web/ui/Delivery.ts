export type DeliveryState = 'sending' | 'accepted' | 'unconfirmed';

/** A missing acknowledgement must not leave the composer disabled indefinitely. Never retries. */
export class Delivery {
  state: DeliveryState = 'sending';
  private timer: ReturnType<typeof setTimeout>;
  constructor(private changed: (state: DeliveryState) => void, timeoutMs = 35_000) {
    this.timer = setTimeout(() => this.unconfirmed(), timeoutMs);
  }
  accept() { this.set('accepted'); }
  unconfirmed() { if (this.state === 'sending') this.set('unconfirmed'); }
  dispose() { clearTimeout(this.timer); }
  private set(state: DeliveryState) { this.dispose(); this.state = state; this.changed(state); }
}
