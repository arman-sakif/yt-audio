import { nearestMp3Bitrate } from "./bitrate.js";
import { ffmpegDir } from "./binaries.js";
import { suggestionHint, suggestMetadata } from "./metadata.js";
import { runTool } from "./run.js";
import { assertYouTubeUrl } from "./youtube-url.js";

export async function preview(rawUrl, tools) {
  const url = assertYouTubeUrl(rawUrl);
  const { stdout } = await runTool(tools.ytdlp, [
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    "-f",
    "bestaudio/best",
    "--ffmpeg-location",
    ffmpegDir(tools),
    url,
  ]);

  let info;
  try {
    info = parseInfo(stdout);
  } catch {
    throw new Error("Could not read that video.");
  }

  const audio = selectedAudio(info) || bestAudio(info);
  const suggestion = suggestMetadata(info);
  const bitrate = audio ? Math.round(audio.abr || audio.tbr || 0) : 0;
  const mp3Bitrate = nearestMp3Bitrate(bitrate);

  return {
    url,
    videoId: info.id || "",
    videoTitle: info.title || "",
    channel: info.channel || info.uploader || "",
    thumbnail: bestThumbnail(info),
    duration: Number(info.duration) > 0 ? Number(info.duration) : null,
    audio: audio
      ? { codec: codecLabel(audio.acodec), bitrate: bitrate || null, mp3Bitrate }
      : null,
    suggestion: {
      ...suggestion,
      hint: suggestionHint(suggestion.source),
    },
  };
}

function parseInfo(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no json");
  return JSON.parse(stdout.slice(start, end + 1));
}

function selectedAudio(info) {
  if (!info.acodec || info.acodec === "none") return null;
  return info;
}

function bestAudio(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const audioOnly = formats.filter(
    (format) => format.acodec && format.acodec !== "none" && (!format.vcodec || format.vcodec === "none"),
  );
  const pool = audioOnly.length
    ? audioOnly
    : formats.filter((format) => format.acodec && format.acodec !== "none");
  pool.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
  return pool[0] || null;
}

function bestThumbnail(info) {
  const thumbs = (Array.isArray(info.thumbnails) ? info.thumbnails : []).filter((thumb) => {
    const url = thumb.url || "";
    return url && !/storyboard|\.mhtml/i.test(url);
  });
  thumbs.sort((a, b) => thumbScore(b) - thumbScore(a));
  return thumbs[0]?.url || info.thumbnail || "";
}

function thumbScore(thumb) {
  const url = thumb.url || "";
  const area = (thumb.width || 0) * (thumb.height || 0);
  const named = url.includes("maxresdefault")
    ? 5
    : url.includes("sddefault")
      ? 4
      : url.includes("hqdefault")
        ? 3
        : url.includes("mqdefault")
          ? 2
          : 0;
  // A measured image beats a name with no size. YouTube lists maxres even when that file 404s.
  if (area > 0) return area + named * 1000;
  return named;
}

function codecLabel(acodec) {
  if (!acodec) return "Audio";
  if (acodec.startsWith("mp4a")) return "AAC";
  if (acodec === "opus") return "Opus";
  if (acodec.includes("vorbis")) return "Vorbis";
  return acodec;
}
