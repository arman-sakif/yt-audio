function fail(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function videoIdFrom(url, host) {
  if (host === "youtu.be") return /^\/[\w-]{6,}$/.test(url.pathname);
  const watchId = url.searchParams.get("v");
  if (watchId && /^[\w-]{6,}$/.test(watchId)) return true;
  return /^\/(?:shorts|embed|live|v)\/[\w-]{6,}/.test(url.pathname);
}

export function assertYouTubeUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) throw fail("Paste a YouTube link.");

  let url;
  try {
    url = new URL(text);
  } catch {
    throw fail("That doesn't look like a link.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw fail("Paste a YouTube link.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
  if (!allowed.has(host)) throw fail("Only YouTube links work.");
  if (!videoIdFrom(url, host)) {
    throw fail("Paste a link to one video. Playlists and channel pages are skipped.");
  }
  return url.toString();
}
