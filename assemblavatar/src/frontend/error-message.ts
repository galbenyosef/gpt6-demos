// Recognize persisted failures from the retired renderer without treating them
// as current runtime alerts. The original diagnostic remains in job storage.
export function isLegacyRendererError(message: string): boolean {
  return message.startsWith("Headless renderer unavailable.") && message.includes("playwright install chromium");
}
