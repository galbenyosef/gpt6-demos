import { CrosstalkError } from '../../cross-talk/src/protocol';
import type { EuropaDisplay } from './EuropaController';

/** Native browser fullscreen, shared by the button and voice tool. */
export class EuropaFullscreen implements EuropaDisplay {
  constructor(private viewer: HTMLElement, private notify: (message: string) => void) {}
  isFullscreen() { return document.fullscreenElement === this.viewer; }
  onFullscreenChange(listener: () => void) {
    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }
  async setFullscreen(enabled: boolean) {
    if (this.isFullscreen() === enabled) return;
    try {
      if (enabled) {
        if (!document.fullscreenEnabled || !this.viewer.requestFullscreen) {
          throw new CrosstalkError('FULLSCREEN_UNAVAILABLE', 'Fullscreen is unavailable in this browser.', false);
        }
        // Attempt the real API: browsers with a fullscreen permission may allow
        // entry even without transient user activation.
        try { await this.viewer.requestFullscreen(); }
        catch (error) {
          if (!navigator.userActivation?.isActive) {
            throw new CrosstalkError('USER_ACTIVATION_REQUIRED', 'Click the fullscreen button to enter fullscreen. Your browser requires a click before entering fullscreen.', true);
          }
          throw error;
        }
      } else {
        await document.exitFullscreen();
      }
      if (this.isFullscreen() !== enabled) throw new Error('Fullscreen did not change.');
    } catch (error) {
      const failure = error instanceof CrosstalkError ? error : new CrosstalkError('FULLSCREEN_UNAVAILABLE', 'The browser could not change fullscreen mode. Please try the fullscreen button.', true);
      this.notify(failure.message);
      throw failure;
    }
  }
}
