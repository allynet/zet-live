export function requestAnimationFrame(callback: () => void) {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16);
}

export function requestIdleCallback(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback);
  }
  return requestAnimationFrame(callback);
}

export function cancelAnimationOrIdleCallback(id: number | null) {
  if (id === null) return;
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(id);
  }
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(id);
  }
  clearTimeout(id);
}
