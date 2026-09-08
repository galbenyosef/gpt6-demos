/** Preserve the musical position under a viewport pixel when changing scale. */
export function anchoredScroll(
  scroll: number,
  anchor: number,
  sticky: number,
  oldScale: number,
  newScale: number,
) {
  return Math.max(0, ((scroll + anchor - sticky) / oldScale) * newScale - anchor + sticky);
}
export function visibleBarCount(zoom: 1 | 2 | 'fit', bars: number) {
  return zoom === 'fit' ? bars : Math.min(zoom, bars);
}
