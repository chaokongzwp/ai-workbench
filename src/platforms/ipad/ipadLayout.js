// Keep a true iPad split view at 820pt and above. Classic 768pt iPads and
// narrower Stage Manager or multitasking windows use the iPad drawer instead
// of squeezing the conversation beside a persistent session list.
export const ipadCompactLayoutMaxWidth = 819;

export function ipadLayoutModeForWidth(width) {
  const viewportWidth = Number(width);
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return "regular";
  return viewportWidth <= ipadCompactLayoutMaxWidth ? "compact" : "regular";
}

export function currentIpadViewportWidth() {
  if (typeof window === "undefined") return 1024;
  return Math.round(
    Number(window.innerWidth) ||
      Number(document.documentElement?.clientWidth) ||
      Number(window.visualViewport?.width) ||
      1024,
  );
}
