import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encodeBitrate } from "./bitrate.js";
import { ffmpegDir } from "./binaries.js";
import { songFilename } from "./filenames.js";
import { runTool } from "./run.js";
import { assertYouTubeUrl } from "./youtube-url.js";

const jobs = new Map();

export function getJob(id) {
  return jobs.get(id) || null;
}

export function publicJob(job) {
  return {
    id: job.id,
    stage: job.stage,
    percent: job.percent,
    error: job.error,
    warning: job.warning,
    filename: job.filename,
    bitrate: job.bitrate,
  };
}

function field(value) {
  return String(value || "")
    .replace(/[\u0000\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function startDownload({ url, title, artist, duration, videoTitle, quality, sourceBitrate, tools }) {
  const safeUrl = assertYouTubeUrl(url);
  const bitrate = encodeBitrate({ quality, sourceBitrate });
  const id = randomUUID();
  const job = {
    id,
    stage: "download",
    percent: 0,
    error: null,
    warning: null,
    filename: null,
    bitrate,
    filePath: null,
    tempDir: null,
    cleanupTimer: null,
  };
  jobs.set(id, job);

  const meta = {
    title: field(title),
    artist: field(artist),
    videoTitle: field(videoTitle),
    duration: Number(duration) > 0 ? Number(duration) : null,
  };

  processJob(job, safeUrl, meta, tools)
    .then(() => {
      if (job.stage === "done") console.log(`Ready ${job.filename}`);
    })
    .catch(async (error) => {
      await discard(job);
      job.stage = "error";
      job.error = error.message || "Download failed.";
      console.error(`Download failed: ${job.error}`);
    });

  return job;
}

export function releaseJob(id) {
  const job = jobs.get(id);
  if (!job) return;
  return discard(job);
}

async function discard(job) {
  const dir = job.tempDir;
  job.tempDir = null;
  job.filePath = null;
  if (job.cleanupTimer) {
    clearTimeout(job.cleanupTimer);
    job.cleanupTimer = null;
  }
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
}

async function processJob(job, url, meta, tools) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "yt-audio-"));
  job.tempDir = temp;
  await downloadAudio(job, url, temp, tools);
  const audioPath = await findAudio(temp);
  const encoded = path.join(temp, "encoded.mp3");
  await encode(job, audioPath, encoded, tools, meta.duration, job.bitrate);

  const thumb = await findThumb(temp);
  let source = encoded;
  if (meta.title || meta.artist || thumb) {
    const tagged = path.join(temp, "tagged.mp3");
    try {
      await tag(job, encoded, tagged, thumb, temp, meta, tools);
      source = tagged;
    } catch {
      job.warning = "The file downloaded, but the title, artist, or cover could not be written.";
    }
  }

  const base = songFilename({
    artist: meta.artist,
    title: meta.title,
    fallback: meta.videoTitle,
  });
  job.filename = `${base}.mp3`;
  job.filePath = source;
  job.stage = "done";
  job.percent = 100;
  job.cleanupTimer = setTimeout(() => releaseJob(job.id), 10 * 60 * 1000);
  job.cleanupTimer.unref?.();
}

async function downloadAudio(job, url, temp, tools) {
  job.stage = "download";
  job.percent = 0;
  const output = path.join(temp, "%(id)s.%(ext)s").replaceAll("\\", "/");
  await runTool(
    tools.ytdlp,
    [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--ffmpeg-location",
      ffmpegDir(tools),
      "-f",
      "bestaudio/best",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "-o",
      output,
      url,
    ],
    (line) => {
      const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match) job.percent = Math.min(99, Math.round(Number(match[1])));
    },
  );
}

async function encode(job, input, output, tools, duration, bitrate) {
  job.stage = "encode";
  job.percent = 0;
  await runTool(
    tools.ffmpeg,
    [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      input,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      `${bitrate}k`,
      "-progress",
      "pipe:1",
      "-nostats",
      output,
    ],
    (line) => {
      const match = line.match(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match || !duration) return;
      const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      job.percent = Math.min(99, Math.round((seconds / duration) * 100));
    },
  );
}

async function tag(job, input, output, thumb, temp, meta, tools) {
  job.stage = "tag";
  job.percent = 100;

  let cover = thumb;
  if (thumb && !/\.jpe?g$/i.test(thumb)) {
    cover = path.join(temp, "cover.jpg");
    await runTool(tools.ffmpeg, ["-hide_banner", "-nostdin", "-y", "-i", thumb, cover]);
  }

  const args = ["-hide_banner", "-nostdin", "-y", "-i", input];
  if (cover) args.push("-i", cover);
  args.push("-map", "0:a");
  if (cover) {
    args.push("-map", "1:v", "-c", "copy", "-disposition:v:0", "attached_pic");
  } else {
    args.push("-c", "copy");
  }
  args.push("-id3v2_version", "3");
  if (meta.title) args.push("-metadata", `title=${meta.title}`);
  if (meta.artist) args.push("-metadata", `artist=${meta.artist}`);
  if (cover) {
    args.push(
      "-metadata:s:v",
      "title=Album cover",
      "-metadata:s:v",
      "comment=Cover (front)",
    );
  }
  args.push(output);
  await runTool(tools.ffmpeg, args);
}

async function findAudio(dir) {
  const names = await readdir(dir);
  const candidates = [];
  for (const name of names) {
    if (/\.(jpe?g|png|webp)$/i.test(name)) continue;
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isFile()) candidates.push({ full, size: info.size });
  }
  candidates.sort((a, b) => b.size - a.size);
  if (!candidates.length) throw new Error("The download finished without an audio file.");
  return candidates[0].full;
}

async function findThumb(dir) {
  const names = await readdir(dir);
  const jpeg = names.find((name) => /\.jpe?g$/i.test(name));
  if (jpeg) return path.join(dir, jpeg);
  const other = names.find((name) => /\.(png|webp)$/i.test(name));
  return other ? path.join(dir, other) : null;
}

