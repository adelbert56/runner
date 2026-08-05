const TRACKING_PARAMETER = /^(utm_.+|fbclid|gclid|mc_[ce]id)$/i;

export function normalizeContentUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMETER.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url || "").replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}
