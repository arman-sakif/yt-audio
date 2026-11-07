const lookupForm = document.querySelector("#lookup-form");
const urlInput = document.querySelector("#url");
const lookupButton = document.querySelector("#lookup");
const message = document.querySelector("#message");
const notice = document.querySelector("#notice");
const preview = document.querySelector("#preview");
const thumb = document.querySelector("#thumb");
const videoTitle = document.querySelector("#video-title");
const videoMeta = document.querySelector("#video-meta");
const quality = document.querySelector("#quality");
const songTitle = document.querySelector("#song-title");
const artistInput = document.querySelector("#artist");
const guess = document.querySelector("#guess");
const bitrateChoice = document.querySelector(".choice");
const originalLabel = document.querySelector("#original-label");
const downloadButton = document.querySelector("#download");
const spotifyBox = document.querySelector("#spotify");
const spotifySetup = document.querySelector("#spotify-setup");
const spotifyConnectRow = document.querySelector("#spotify-connect-row");
const spotifyConnect = document.querySelector("#spotify-connect");
const spotifyOn = document.querySelector("#spotify-on");
const spotifyLike = document.querySelector("#spotify-like");
const spotifyName = document.querySelector("#spotify-name");
const spotifyDisconnect = document.querySelector("#spotify-disconnect");
const barWrap = document.querySelector("#bar-wrap");
const bar = document.querySelector("#bar");
const status = document.querySelector("#status");

let current = null;
let viewToken = 0;
let spotify = { state: "loading" };

urlInput.addEventListener("input", () => {
  viewToken += 1;
  current = null;
  preview.hidden = true;
  setMessage("");
  setNotice("");
});

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = ++viewToken;
  current = null;
  preview.hidden = true;
  setMessage("");
  setNotice("");
  lookupButton.disabled = true;
  lookupButton.textContent = "Looking up…";

  try {
    const response = await fetch("/api/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: urlInput.value }),
    });
    const data = await readBody(response);
    if (token !== viewToken) return;
    if (!response.ok) throw new Error(data.error || "Could not look up that video.");
    current = data;
    showPreview(data);
  } catch (error) {
    if (token === viewToken) setMessage(error.message);
  } finally {
    if (token === viewToken) {
      lookupButton.disabled = false;
      lookupButton.textContent = "Look up";
    }
  }
});

bitrateChoice.addEventListener("change", () => {
  refreshDownloadLabel();
});

downloadButton.addEventListener("click", async () => {
  if (!current) return;
  const token = viewToken;
  const quality = selectedQuality();
  setMessage("");
  downloadButton.disabled = true;
  setBitrateLocked(true);
  barWrap.hidden = false;
  setProgress(0);
  status.textContent = "Starting…";
  const likeTask = startSpotifyLike();

  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: current.url,
        title: songTitle.value,
        artist: artistInput.value,
        duration: current.duration,
        videoTitle: current.videoTitle,
        quality,
        sourceBitrate: quality === "original" ? current.audio?.mp3Bitrate : undefined,
      }),
    });
    const data = await readBody(response);
    if (token !== viewToken) return;
    if (!response.ok) throw new Error(data.error || "Could not start the download.");
    poll(data.id, token, likeTask);
  } catch (error) {
    if (token !== viewToken) return;
    barWrap.hidden = true;
    status.textContent = "";
    downloadButton.disabled = false;
    setBitrateLocked(false);
    const extra = await likeNote(likeTask);
    if (token !== viewToken) return;
    setMessage(extra ? `${error.message} ${extra}` : error.message);
  }
});

spotifyConnect.addEventListener("click", () => {
  window.location.href = "/api/spotify/login";
});

spotifyDisconnect.addEventListener("click", async () => {
  spotifyDisconnect.disabled = true;
  try {
    const response = await fetch("/api/spotify/logout", { method: "POST" });
    const data = await readBody(response);
    if (!response.ok) throw new Error(data.error || "Could not disconnect Spotify.");
    spotify = { state: "disconnected" };
    spotifyOn.dataset.ready = "";
    renderSpotify();
    setNotice("Spotify is disconnected on this computer.");
  } catch (error) {
    setMessage(error.message);
  } finally {
    spotifyDisconnect.disabled = false;
  }
});

function showPreview(data) {
  preview.hidden = false;
  if (data.thumbnail) {
    thumb.hidden = false;
    thumb.dataset.fallback = "";
    thumb.src = data.thumbnail;
    thumb.alt = data.videoTitle ? `Still from ${data.videoTitle}` : "Video still";
    thumb.onerror = () => {
      if (thumb.dataset.fallback !== "1" && data.videoId) {
        thumb.dataset.fallback = "1";
        thumb.src = `https://i.ytimg.com/vi/${encodeURIComponent(data.videoId)}/hqdefault.jpg`;
        return;
      }
      thumb.hidden = true;
    };
  } else {
    thumb.hidden = true;
    thumb.removeAttribute("src");
    thumb.alt = "";
  }
  videoTitle.textContent = data.videoTitle || "Untitled video";
  const bits = [data.channel, data.duration ? formatDuration(data.duration) : ""].filter(Boolean);
  videoMeta.textContent = bits.join(" · ");
  quality.textContent = qualityLine(data.audio);
  songTitle.value = data.suggestion?.title || "";
  artistInput.value = data.suggestion?.artist || "";
  guess.textContent = data.suggestion?.hint || "";
  status.textContent = "";
  barWrap.hidden = true;
  downloadButton.disabled = false;
  setBitrateLocked(false);
  renderBitrateChoice();
  renderSpotify();
}

async function poll(id, token, likeTask) {
  try {
    const response = await fetch(`/api/jobs/${id}`);
    const job = await readBody(response);
    if (token !== viewToken) return;
    if (!response.ok) throw new Error(job.error || "Lost track of that download.");

    if (job.stage === "done") {
      setProgress(100);
      const saved = `Saving ${job.filename || "the MP3"} to your Downloads folder.`;
      const base = job.warning ? `${job.warning} ${saved}` : saved;
      status.textContent = base;
      downloadButton.disabled = false;
      setBitrateLocked(false);
      saveCopy(id, job.filename);
      const extra = await likeNote(likeTask);
      if (token !== viewToken) return;
      if (extra) status.textContent = `${base} ${extra}`;
      return;
    }

    if (job.stage === "error") {
      barWrap.hidden = true;
      status.textContent = "";
      downloadButton.disabled = false;
      setBitrateLocked(false);
      const extra = await likeNote(likeTask);
      if (token !== viewToken) return;
      const failed = job.error || "Download failed.";
      setMessage(extra ? `${failed} ${extra}` : failed);
      return;
    }

    setProgress(job.percent || 0);
    status.textContent = stageLabel(job);
    setTimeout(() => poll(id, token, likeTask), 400);
  } catch (error) {
    if (token !== viewToken) return;
    downloadButton.disabled = false;
    setBitrateLocked(false);
    const extra = await likeNote(likeTask);
    if (token !== viewToken) return;
    setMessage(extra ? `${error.message} ${extra}` : error.message);
  }
}

function saveCopy(id, filename) {
  const link = document.createElement("a");
  link.href = `/api/files/${id}`;
  link.download = filename || "audio.mp3";
  document.body.append(link);
  link.click();
  link.remove();
}

function stageLabel(job) {
  const pct = job.percent ? ` ${job.percent}%` : "";
  if (job.stage === "download") return `Downloading${pct}`;
  if (job.stage === "encode") {
    const rate = job.bitrate ? `${job.bitrate} kbps ` : "";
    return `Encoding ${rate}MP3${pct}`;
  }
  if (job.stage === "tag") return "Writing title, artist, and cover";
  return "Working";
}

function qualityLine(audio) {
  if (audio?.bitrate && audio.mp3Bitrate && audio.mp3Bitrate !== audio.bitrate) {
    return `${audio.codec} around ${audio.bitrate} kbps from YouTube. Original max saves a ${audio.mp3Bitrate} kbps MP3.`;
  }
  if (audio?.bitrate) return `${audio.codec} around ${audio.bitrate} kbps from YouTube.`;
  if (audio?.codec) return `${audio.codec} from YouTube.`;
  return "YouTube did not report an audio bitrate for this video.";
}

function selectedQuality() {
  return bitrateChoice.querySelector("input:checked")?.value === "original" ? "original" : "320";
}

function renderBitrateChoice() {
  const rate = current?.audio?.mp3Bitrate;
  originalLabel.textContent = rate ? `Original max bitrate · ${rate} kbps` : "Original max bitrate";
  refreshDownloadLabel();
}

function refreshDownloadLabel() {
  if (selectedQuality() === "320") {
    downloadButton.textContent = "Download 320 kbps MP3";
    return;
  }
  const rate = current?.audio?.mp3Bitrate;
  downloadButton.textContent = rate ? `Download ${rate} kbps MP3` : "Download original bitrate MP3";
}

function setBitrateLocked(locked) {
  for (const input of bitrateChoice.querySelectorAll("input")) input.disabled = locked;
}

function setProgress(percent) {
  const value = Math.max(0, Math.min(100, percent));
  bar.style.width = `${value}%`;
  barWrap.setAttribute("aria-valuenow", String(value));
}

function startSpotifyLike() {
  if (spotify.state !== "connected" || !spotifyLike.checked) return Promise.resolve("");
  const title = songTitle.value;
  const artist = artistInput.value;
  const duration = current?.duration;
  return fetch("/api/spotify/like", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, artist, duration }),
  })
    .then(async (response) => {
      const data = await readBody(response);
      if (data.disconnected) {
        spotify = { state: "disconnected" };
        spotifyOn.dataset.ready = "";
        renderSpotify();
      }
      if (!response.ok) return data.error || "Spotify could not save that song. The MP3 still downloaded.";
      return data.message || "";
    })
    .catch(() => "Spotify could not be reached. The MP3 still downloaded.");
}

function likeNote(likeTask) {
  return Promise.resolve(likeTask).then((text) => text || "").catch(() => "");
}

function renderSpotify() {
  const state = spotify.state;
  spotifyBox.hidden = state === "loading";
  spotifySetup.hidden = state !== "unconfigured";
  spotifyConnectRow.hidden = state !== "disconnected";
  spotifyOn.hidden = state !== "connected";
  if (state === "connected") {
    spotifyName.textContent = spotify.name || "Spotify";
    if (!spotifyOn.dataset.ready) {
      spotifyLike.checked = true;
      spotifyOn.dataset.ready = "1";
    }
  }
}

async function loadSpotify() {
  try {
    const response = await fetch("/api/spotify/status");
    const data = await readBody(response);
    spotify = response.ok && data.state ? data : { state: "unconfigured" };
  } catch {
    spotify = { state: "unconfigured" };
  }
  renderSpotify();
}

function setMessage(text) {
  message.textContent = text || "";
  message.hidden = !text;
}

function setNotice(text) {
  notice.textContent = text || "";
  notice.hidden = !text;
}

function formatDuration(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  if (hours) return `${hours}:${pad(minutes)}:${pad(remain)}`;
  return `${minutes}:${pad(remain)}`;
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

const spotifyQuery = new URLSearchParams(location.search).get("spotify");
if (spotifyQuery) {
  history.replaceState(null, "", location.pathname);
  const failures = {
    denied: "Spotify was not connected.",
    expired: "That Spotify connection attempt expired. Try Connect Spotify again.",
    failed: "Spotify could not be connected.",
    unconfigured: "Add your Spotify Client ID to data/spotify.json first.",
  };
  if (spotifyQuery === "connected") {
    setNotice("Spotify is connected. A download can also save the song to Liked Songs.");
  } else if (failures[spotifyQuery]) {
    setMessage(failures[spotifyQuery]);
  }
}

loadSpotify();
urlInput.focus();
