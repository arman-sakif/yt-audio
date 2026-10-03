import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { resolveTools } from "./lib/binaries.js";
import { getJob, publicJob, releaseJob, startDownload } from "./lib/download.js";
import { preview } from "./lib/preview.js";

const publicDir = path.resolve(import.meta.dirname, "public");
const startPort = Number(process.env.PORT) || 3847;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

console.log("Checking yt-dlp and ffmpeg…");
const tools = await resolveTools();

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = error.status || 500;
    if (status === 500) console.error(error);
    sendJson(res, status, {
      error: status === 500 ? "Something went wrong." : error.message,
    });
  });
});

const port = await listen(startPort);
const page = `http://127.0.0.1:${port}`;
console.log("");
console.log("YouTube to MP3");
console.log(page);
console.log("Each MP3 is saved by the browser to your Downloads folder.");
console.log("Leave this window open. Press Ctrl+C to stop.");
openBrowser(page);

async function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "POST" && url.pathname === "/api/preview") {
    const body = await readJson(req);
    sendJson(res, 200, await preview(body.url, tools));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/download") {
    const body = await readJson(req);
    const job = startDownload({
      url: body.url,
      title: body.title,
      artist: body.artist,
      duration: body.duration,
      videoTitle: body.videoTitle,
      tools,
    });
    sendJson(res, 202, { id: job.id });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
    const job = getJob(url.pathname.slice("/api/jobs/".length));
    if (!job) {
      sendJson(res, 404, { error: "Unknown download." });
      return;
    }
    sendJson(res, 200, publicJob(job));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/files/")) {
    await sendAudio(res, url.pathname.slice("/api/files/".length));
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "That request is not supported." });
    return;
  }

  let pathname = "/";
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: "Bad path." });
    return;
  }

  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  await serveStatic(req, res, pathname);
}

async function sendAudio(res, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    sendJson(res, 404, { error: "Unknown download." });
    return;
  }
  const job = getJob(id);
  if (!job?.filePath || job.stage !== "done") {
    sendJson(res, 404, { error: "That file is not ready." });
    return;
  }
  if (!job.tempDir || !inside(job.tempDir, job.filePath)) {
    sendJson(res, 404, { error: "That file is not ready." });
    return;
  }

  const info = await stat(job.filePath);
  res.writeHead(200, {
    "content-type": "audio/mpeg",
    "content-length": info.size,
    "content-disposition": contentDisposition(job.filename || "audio.mp3"),
  });
  const stream = createReadStream(job.filePath);
  stream.on("close", () => releaseJob(id));
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const target = path.resolve(publicDir, relative);
  if (!inside(publicDir, target)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  let body;
  try {
    body = await readFile(target);
  } catch {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  res.writeHead(200, {
    "content-type": TYPES[path.extname(target)] || "application/octet-stream",
    "content-length": body.length,
    "cache-control": "no-cache",
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

function inside(root, target) {
  const base = path.resolve(root).toLowerCase();
  const resolved = path.resolve(target).toLowerCase();
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        fail(Object.assign(new Error("That request is too large."), { status: 400 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Could not read that request."), { status: 400 }));
      }
    });
    req.on("error", fail);
  });
}

function listen(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port >= start + 10) {
        reject(new Error(`Ports ${start}–${start + 9} are all in use.`));
        return;
      }
      const onError = (error) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE") {
          tryPort(port + 1);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    };
    tryPort(start);
  });
}

function openBrowser(url) {
  if (process.env.YT_AUDIO_NO_OPEN === "1") return;
  const browser = spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  browser.on("error", () => {});
  browser.unref();
}
