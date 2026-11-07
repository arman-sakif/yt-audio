import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pickTrack, searchQueries } from "./spotify-match.js";

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const configPath = path.join(dataDir, "spotify.json");
const sessionPath = path.join(dataDir, "spotify-session.json");
const SCOPE = "user-library-modify";
const PENDING_MS = 10 * 60 * 1000;

export function spotifyRedirectUri(port) {
  return `http://127.0.0.1:${port}/api/spotify/callback`;
}

const pending = new Map();
let cache = null;
let refreshing = null;

export async function spotifyStatus(port) {
  const redirectUri = spotifyRedirectUri(port);
  const clientId = await readClientId();
  if (!clientId) return { state: "unconfigured", redirectUri };
  const session = await readSession();
  if (!session?.refreshToken) return { state: "disconnected", redirectUri };
  return { state: "connected", name: session.displayName || "Spotify", redirectUri };
}

export async function spotifyLoginUrl(port) {
  const clientId = await readClientId();
  if (!clientId) {
    throw Object.assign(new Error("Add your Spotify Client ID to data/spotify.json first."), { status: 400 });
  }
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = spotifyRedirectUri(port);
  const state = rememberLogin({ verifier, redirectUri });
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function spotifyCallback({ code, state, error }) {
  if (error || !code) return "/?spotify=denied";
  const login = takePending(state);
  if (!login) return "/?spotify=expired";
  try {
    const clientId = await readClientId();
    if (!clientId) return "/?spotify=unconfigured";
    const tokens = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: login.redirectUri,
      client_id: clientId,
      code_verifier: login.verifier,
    }, { forgetSession: false });
    const profile = await readProfile(tokens.access_token);
    await writeSession({
      refreshToken: tokens.refresh_token,
      displayName: profile,
    });
    rememberAccessToken(tokens);
    return "/?spotify=connected";
  } catch (err) {
    console.error("Spotify connect failed:", err.spotifyError || err.message);
    return "/?spotify=failed";
  }
}

export async function spotifyLogout() {
  cache = null;
  await clearSession();
  return { state: "disconnected" };
}

export async function likeTrack({ title, artist, duration }) {
  const song = String(title || "").trim();
  const person = String(artist || "").trim();
  if (!song || !person) {
    return { saved: false, message: "Add a song title and artist to save it on Spotify." };
  }

  const clientId = await readClientId();
  const session = await readSession();
  if (!clientId || !session?.refreshToken) {
    return { saved: false, disconnected: true, message: "Connect Spotify to save songs to Liked Songs." };
  }

  const found = [];
  const seen = new Set();
  try {
    for (const query of searchQueries(song, person)) {
      const items = await searchTracks(query);
      for (const item of items) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        found.push(item);
      }
      if (pickTrack(found, { title: song, artist: person, duration })) break;
    }
  } catch (error) {
    if (error.disconnected) {
      return { saved: false, disconnected: true, message: "Spotify needs you to connect again." };
    }
    console.error("Spotify search failed:", error.spotifyError || error.message);
    return { saved: false, message: error.publicMessage || "Spotify could not be reached. The MP3 still downloaded." };
  }

  const track = pickTrack(found, { title: song, artist: person, duration });
  if (!track) {
    return {
      saved: false,
      message: "No close Spotify match for that title and artist, so nothing was saved.",
    };
  }

  try {
    await saveTrack(track.uri || `spotify:track:${track.id}`);
  } catch (error) {
    if (error.disconnected) {
      return { saved: false, disconnected: true, message: "Spotify needs you to connect again." };
    }
    console.error("Spotify save failed:", error.spotifyError || error.message);
    return { saved: false, message: error.publicMessage || "Spotify could not save that song. The MP3 still downloaded." };
  }

  const savedName = track.name || song;
  const savedBy = (track.artists || []).map((item) => item?.name).filter(Boolean).join(", ") || person;
  return { saved: true, message: `Saved ${savedName} by ${savedBy} to Liked Songs.` };
}

function rememberLogin(entry) {
  const now = Date.now();
  for (const [key, value] of pending) {
    if (now - value.created > PENDING_MS) pending.delete(key);
  }
  const state = randomBytes(16).toString("base64url");
  pending.set(state, { ...entry, created: now });
  return state;
}

function takePending(state) {
  if (!state) return null;
  const entry = pending.get(state);
  pending.delete(state);
  if (!entry || Date.now() - entry.created > PENDING_MS) return null;
  return entry;
}

async function readClientId() {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    const id = String(parsed.clientId || "").trim();
    return /^[A-Za-z0-9]{8,64}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

async function readSession() {
  try {
    const parsed = JSON.parse(await readFile(sessionPath, "utf8"));
    const refreshToken = String(parsed.refreshToken || "");
    const displayName = String(parsed.displayName || "").slice(0, 80);
    if (!refreshToken) return null;
    return { refreshToken, displayName };
  } catch {
    return null;
  }
}

async function writeSession(session) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(session)}\n`, "utf8");
}

async function clearSession() {
  await rm(sessionPath, { force: true });
}

async function postToken(params, { forgetSession = false } = {}) {
  let response;
  try {
    response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
  } catch {
    throw Object.assign(new Error("Spotify could not be reached."), {
      publicMessage: "Spotify could not be reached. The MP3 still downloaded.",
    });
  }
  const data = await readJson(response);
  if (!response.ok) {
    const disconnected = forgetSession && (response.status === 400 || response.status === 401);
    if (disconnected) {
      cache = null;
      await clearSession();
    }
    throw Object.assign(new Error("Spotify token request failed."), {
      spotifyError: data.error || String(response.status),
      disconnected,
      publicMessage: disconnected
        ? "Spotify needs you to connect again."
        : "Spotify could not be reached. The MP3 still downloaded.",
    });
  }
  return data;
}

function rememberAccessToken(tokens) {
  if (!tokens?.access_token) return;
  const seconds = Number(tokens.expires_in) || 3600;
  cache = { token: tokens.access_token, expiresAt: Date.now() + seconds * 1000 };
}

async function accessToken() {
  if (cache && cache.expiresAt > Date.now() + 15_000) return cache.token;
  if (!refreshing) {
    refreshing = refreshAccessToken().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function refreshAccessToken() {
  const clientId = await readClientId();
  const session = await readSession();
  if (!clientId || !session?.refreshToken) {
    throw Object.assign(new Error("Spotify is not connected."), {
      disconnected: true,
      publicMessage: "Connect Spotify to save songs to Liked Songs.",
    });
  }
  const tokens = await postToken({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: clientId,
  }, { forgetSession: true });
  if (tokens.refresh_token) {
    await writeSession({ refreshToken: tokens.refresh_token, displayName: session.displayName });
  }
  rememberAccessToken(tokens);
  return tokens.access_token;
}

async function spotifyFetch(apiPath, options = {}, retry = true) {
  const token = await accessToken();
  let response;
  try {
    response = await fetch(`https://api.spotify.com/v1${apiPath}`, {
      ...options,
      headers: { ...(options.headers || {}), authorization: `Bearer ${token}` },
    });
  } catch {
    throw Object.assign(new Error("Spotify could not be reached."), {
      publicMessage: "Spotify could not be reached. The MP3 still downloaded.",
    });
  }
  if (response.status === 401 && retry) {
    cache = null;
    return spotifyFetch(apiPath, options, false);
  }
  if (response.status === 401) {
    cache = null;
    await clearSession();
    throw Object.assign(new Error("Spotify rejected the session."), {
      disconnected: true,
      publicMessage: "Spotify needs you to connect again.",
    });
  }
  if (!response.ok) {
    const data = await readJson(response);
    throw Object.assign(new Error("Spotify request failed."), {
      spotifyError: data.error?.reason || data.error?.message || String(response.status),
      publicMessage: publicApiMessage(response.status),
    });
  }
  return response;
}

async function searchTracks(query) {
  const params = new URLSearchParams({ q: query, type: "track", limit: "10" });
  const response = await spotifyFetch(`/search?${params}`);
  const data = await readJson(response);
  return data.tracks?.items || [];
}

async function saveTrack(uri) {
  const params = new URLSearchParams({ uris: uri });
  const response = await spotifyFetch(`/me/library?${params}`, { method: "PUT" });
  await response.arrayBuffer().catch(() => {});
}

async function readProfile(token) {
  try {
    const response = await fetch("https://api.spotify.com/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return "Spotify";
    const profile = await readJson(response);
    return String(profile.display_name || profile.id || "Spotify").slice(0, 80);
  } catch {
    return "Spotify";
  }
}

function publicApiMessage(status) {
  if (status === 403) {
    return "Spotify refused that save. The app owner needs Spotify Premium, and this account has to be allowed on the app.";
  }
  if (status === 429) return "Spotify is rate limiting this app right now. The MP3 still downloaded.";
  return "Spotify could not save that song. The MP3 still downloaded.";
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
