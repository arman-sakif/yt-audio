const lookupForm = document.querySelector("#lookup-form");
const urlInput = document.querySelector("#url");
const lookupButton = document.querySelector("#lookup");
const message = document.querySelector("#message");
const preview = document.querySelector("#preview");
const thumb = document.querySelector("#thumb");
const videoTitle = document.querySelector("#video-title");
const videoMeta = document.querySelector("#video-meta");
const quality = document.querySelector("#quality");
const songTitle = document.querySelector("#song-title");
const artistInput = document.querySelector("#artist");
const guess = document.querySelector("#guess");
const downloadButton = document.querySelector("#download");
const barWrap = document.querySelector("#bar-wrap");
const bar = document.querySelector("#bar");
const status = document.querySelector("#status");

let current = null;
let viewToken = 0;

urlInput.addEventListener("input", () => {
  viewToken += 1;
  current = null;
  preview.hidden = true;
  setMessage("");
});

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = ++viewToken;
  current = null;
  preview.hidden = true;
  setMessage("");
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

downloadButton.addEventListener("click", async () => {
  if (!current) return;
  const token = viewToken;
  setMessage("");
  downloadButton.disabled = true;
  barWrap.hidden = false;
  setProgress(0);
  status.textContent = "Starting…";

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
      }),
    });
    const data = await readBody(response);
    if (token !== viewToken) return;
    if (!response.ok) throw new Error(data.error || "Could not start the download.");
    poll(data.id, token);
  } catch (error) {
    if (token !== viewToken) return;
    barWrap.hidden = true;
    status.textContent = "";
    downloadButton.disabled = false;
    setMessage(error.message);
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
}

async function poll(id, token) {
  try {
    const response = await fetch(`/api/jobs/${id}`);
    const job = await readBody(response);
    if (token !== viewToken) return;
    if (!response.ok) throw new Error(job.error || "Lost track of that download.");

    if (job.stage === "done") {
      setProgress(100);
      const saved = `Saving ${job.filename || "the MP3"} to your Downloads folder.`;
      status.textContent = job.warning ? `${job.warning} ${saved}` : saved;
      downloadButton.disabled = false;
      saveCopy(id, job.filename);
      return;
    }

    if (job.stage === "error") {
      barWrap.hidden = true;
      status.textContent = "";
      downloadButton.disabled = false;
      setMessage(job.error || "Download failed.");
      return;
    }

    setProgress(job.percent || 0);
    status.textContent = stageLabel(job);
    setTimeout(() => poll(id, token), 400);
  } catch (error) {
    if (token !== viewToken) return;
    downloadButton.disabled = false;
    setMessage(error.message);
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
  if (job.stage === "encode") return `Encoding 320 kbps MP3${pct}`;
  if (job.stage === "tag") return "Writing title, artist, and cover";
  return "Working";
}

function qualityLine(audio) {
  const ceiling = "Saved as a 320 kbps MP3. The encode can't add detail the upload never had.";
  if (audio?.bitrate) return `${audio.codec} around ${audio.bitrate} kbps from YouTube. ${ceiling}`;
  if (audio?.codec) return `${audio.codec} from YouTube. ${ceiling}`;
  return ceiling;
}

function setProgress(percent) {
  const value = Math.max(0, Math.min(100, percent));
  bar.style.width = `${value}%`;
  barWrap.setAttribute("aria-valuenow", String(value));
}

function setMessage(text) {
  message.textContent = text || "";
  message.hidden = !text;
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

urlInput.focus();
