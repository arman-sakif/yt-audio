import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BIN = path.resolve(import.meta.dirname, "..", "bin");

const YTDLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const FFMPEG_URL =
  "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function which(command) {
  const result = spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return null;
  const line = result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line || null;
}

async function download(url, dest, label) {
  console.log(`Downloading ${label}…`);
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "yt-audio" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${label} (${response.status}).`);
  }
  const total = Number(response.headers.get("content-length")) || 0;
  let received = 0;
  let nextMark = 25;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (total) {
        const pct = Math.floor((received / total) * 100);
        if (pct >= nextMark) {
          console.log(`${label}: ${pct}%`);
          nextMark += 25;
        }
      }
      callback(null, chunk);
    },
  });
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(dest));
  } catch (error) {
    await rm(dest, { force: true });
    throw error;
  }
  console.log(`${label}: done`);
}

async function findFile(dir, name) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(full, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
}

async function extractFfmpeg(zipPath) {
  const dest = path.join(BIN, "_ffmpeg");
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  console.log("Extracting ffmpeg…");
  await execFileAsync("tar.exe", ["-xf", zipPath, "-C", dest], { windowsHide: true });
  const ffmpeg = await findFile(dest, "ffmpeg.exe");
  const ffprobe = await findFile(dest, "ffprobe.exe");
  if (!ffmpeg || !ffprobe) {
    throw new Error("The ffmpeg download did not include ffmpeg.exe and ffprobe.exe.");
  }
  await copyFile(ffmpeg, path.join(BIN, "ffmpeg.exe"));
  await copyFile(ffprobe, path.join(BIN, "ffprobe.exe"));
  await rm(dest, { recursive: true, force: true });
  await rm(zipPath, { force: true });
}

async function assertRuns(file, args) {
  try {
    await execFileAsync(file, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  } catch {
    throw new Error(
      `${path.basename(file)} did not start. If Windows blocked it, allow the program in the bin folder and run this again.`,
    );
  }
}

async function assertMp3Encoder(ffmpeg) {
  const { stdout, stderr } = await execFileAsync(ffmpeg, ["-hide_banner", "-encoders"], {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (!`${stdout}\n${stderr}`.includes("libmp3lame")) {
    throw new Error("This ffmpeg cannot encode MP3.");
  }
}

export function ffmpegDir(tools) {
  return path.dirname(tools.ffmpeg);
}

export async function resolveTools() {
  const local = {
    ytdlp: path.join(BIN, "yt-dlp.exe"),
    ffmpeg: path.join(BIN, "ffmpeg.exe"),
    ffprobe: path.join(BIN, "ffprobe.exe"),
  };

  const haveLocal =
    (await fileExists(local.ytdlp)) &&
    (await fileExists(local.ffmpeg)) &&
    (await fileExists(local.ffprobe));

  let tools = local;
  if (!haveLocal) {
    const onPath = {
      ytdlp: which("yt-dlp"),
      ffmpeg: which("ffmpeg"),
      ffprobe: which("ffprobe"),
    };
    if (onPath.ytdlp && onPath.ffmpeg && onPath.ffprobe) {
      tools = onPath;
    } else {
      await mkdir(BIN, { recursive: true });
      if (!(await fileExists(local.ytdlp))) {
        await download(YTDLP_URL, local.ytdlp, "yt-dlp");
      }
      if (!(await fileExists(local.ffmpeg)) || !(await fileExists(local.ffprobe))) {
        const zipPath = path.join(BIN, "ffmpeg.zip");
        await download(FFMPEG_URL, zipPath, "ffmpeg");
        await extractFfmpeg(zipPath);
      }
      tools = local;
    }
  }

  await assertRuns(tools.ytdlp, ["--version"]);
  await assertRuns(tools.ffmpeg, ["-version"]);
  await assertRuns(tools.ffprobe, ["-version"]);
  await assertMp3Encoder(tools.ffmpeg);
  return tools;
}
