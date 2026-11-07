import { cleanTitle, normalizeNoise } from "./metadata.js";

const ARTIST_SPLIT = /\s+(?:feat\.?|ft\.?|featuring)\s+|,\s*|\s+&\s+/i;
const FEAT_NOTE = /\s*[([]\s*(?:feat\.?|ft\.?|featuring)\s+[^)\]]+[)\]]/gi;
const FEAT_TAIL = /\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i;

function comparable(text) {
  const prepared = String(text || "").replace(/\+/g, " and ");
  return normalizeNoise(cleanTitle(prepared));
}

function titleKey(text) {
  const withoutFeat = String(text || "")
    .replace(FEAT_NOTE, "")
    .replace(FEAT_TAIL, "");
  return comparable(withoutFeat);
}

function artistKey(text) {
  return comparable(text).replace(/^the /, "");
}

function artistParts(text) {
  return String(text || "")
    .split(ARTIST_SPLIT)
    .map((part) => artistKey(part))
    .filter(Boolean);
}

function phrase(text) {
  const clean = String(text || "").replace(/["\\]/g, "").trim();
  return `"${clean}"`;
}

export function searchQueries(title, artist) {
  const track = phrase(title);
  const parts = String(artist || "")
    .split(ARTIST_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);
  const queries = [`track:${track} artist:${phrase(artist)}`];
  if (parts.length > 1) queries.push(`track:${track} artist:${phrase(parts[0])}`);
  return queries;
}

export function pickTrack(tracks, { title, artist, duration } = {}) {
  const wantedTitle = titleKey(title);
  const wantedArtists = artistParts(artist);
  if (!wantedTitle || !wantedArtists.length) return null;

  const matches = (tracks || []).filter((track) => {
    if (!track?.id || track.is_local) return false;
    if (titleKey(track.name) !== wantedTitle) return false;
    const names = (track.artists || []).map((person) => artistKey(person?.name)).filter(Boolean);
    return wantedArtists.every((part) => names.includes(part));
  });
  if (!matches.length) return null;

  const seconds = Number(duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return matches[0];

  return matches
    .map((track) => ({
      track,
      gap: Math.abs((Number(track.duration_ms) || 0) / 1000 - seconds),
    }))
    .sort((a, b) => a.gap - b.gap)[0].track;
}
