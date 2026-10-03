import { access } from "node:fs/promises";
import path from "node:path";

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function safeFilename(name) {
  let cleaned = String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  cleaned = cleaned.slice(0, 120).replace(/[. ]+$/g, "").trim();
  if (!cleaned) return "audio";
  if (RESERVED.test(cleaned)) return `_${cleaned}`;
  return cleaned;
}

export function songFilename({ artist, title, fallback }) {
  const a = String(artist || "").trim();
  const t = String(title || "").trim();
  let base = fallback || "audio";
  if (a && t) base = `${a} - ${t}`;
  else if (t) base = t;
  else if (a) base = a;
  return safeFilename(base);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function uniqueFilename(dir, base, ext) {
  const safe = safeFilename(base);
  let candidate = `${safe}${ext}`;
  let n = 2;
  while (await exists(path.join(dir, candidate))) {
    candidate = `${safe} (${n})${ext}`;
    n += 1;
    if (n > 999) {
      throw new Error("Too many files already use that name.");
    }
  }
  return candidate;
}
