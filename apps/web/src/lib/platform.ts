// Which device is this, when the answer genuinely changes what we show.
// Two callers today: native navigation picks Apple Maps, and the homepage
// explains installing by hand because Safari offers no install prompt.

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac. navigator.platform is deprecated, so
  // the give-away is a "Macintosh" that answers to touch.
  return (
    /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

// Running as an installed app rather than in a browser tab.
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS predates display-mode and reports it its own way.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
