/**
 * Split total panel height into list (top 60%) + detail (bottom 40%) panes.
 * Returns { listH: height, detailH: 0 } when the terminal is too short.
 */
export function splitPanelHeight(height: number): { listH: number; detailH: number } {
  if (height < 16) return { listH: height, detailH: 0 };
  const detailH = Math.max(4, Math.round(height * 0.4));
  const listH = height - detailH;
  return { listH, detailH };
}
