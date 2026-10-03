const NOISE_EXACT =
  /^(official\s+)?(music\s+video|lyric\s+video|lyrics|lyric|audio|video|visualizer|mv|hd|hq|4k|8k|full\s+song|with\s+lyrics)$/;

export function normalizeNoise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isNoise(text) {
  const t = normalizeNoise(text);
  if (!t) return false;
  if (t === "official" || NOISE_EXACT.test(t)) return true;
  const stripped = t.replace(/\b(hd|hq|4k|8k|uhd)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return true;
  if (stripped !== t && (stripped === "official" || NOISE_EXACT.test(stripped))) return true;
  return false;
}

export function cleanTitle(title) {
  let s = String(title || "").replace(/\s+/g, " ").trim();
  let previous = "";
  while (s !== previous) {
    previous = s;
    s = s.replace(/\s*[([【]([^()[\]【】]*)[)\]】]/g, (full, inner) => (isNoise(inner) ? "" : full));
  }
  let guard = 0;
  while (guard++ < 6) {
    const match = s.match(/^(.*)\s*[|｜]\s*([^|｜]+)$/);
    if (!match || !isNoise(match[2])) break;
    s = match[1];
  }
  s = s.replace(
    /\s+(?:official\s+(?:music\s+)?video|official\s+audio|official\s+lyric\s+video|lyric\s+video|visualizer)$/i,
    "",
  );
  s = s.replace(/\s{2,}/g, " ").replace(/\s*[|｜]\s*$/g, "").trim();
  return s;
}

export function splitArtistTitle(cleaned) {
  const parts = String(cleaned || "").split(/\s+[-–—]\s+/);
  if (parts.length < 2) return null;
  const artist = parts[0].trim();
  const title = parts.slice(1).join(" - ").trim();
  if (!artist || !title || isNoise(artist)) return null;
  return { artist, title };
}

export function artistFromChannel(channel) {
  return String(channel || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+-\s+topic$/i, "")
    .replace(/vevo$/i, "")
    .trim();
}

export function suggestMetadata(info = {}) {
  const rawTitle = info.title || "";
  const channel = info.channel || info.uploader || "";
  const track = String(info.track || "").trim();
  const artistField = String(info.artist || info.album_artist || "").trim();
  const cleaned = cleanTitle(rawTitle);
  const split = splitArtistTitle(cleaned);

  if (split) {
    return { title: split.title, artist: split.artist, source: "title" };
  }
  if (track && artistField) {
    return { title: cleanTitle(track) || track, artist: artistField, source: "youtube" };
  }
  return {
    title: cleaned || track || rawTitle,
    artist: artistFromChannel(channel),
    source: "channel",
  };
}

const HINTS = {
  title: "Guessed from the video title. Change either field if it is wrong.",
  youtube: "Filled from the video's own tags. Those tags are often wrong.",
  channel: "No artist was in the title, so the channel name is filled in.",
};

export function suggestionHint(source) {
  return HINTS[source] || HINTS.title;
}
