const MP3_BITRATES = [32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

export function nearestMp3Bitrate(kbps) {
  const value = Number(kbps);
  if (!Number.isFinite(value) || value <= 0) return null;
  let best = MP3_BITRATES[0];
  let diff = Math.abs(best - value);
  for (const rate of MP3_BITRATES) {
    const next = Math.abs(rate - value);
    if (next < diff || (next === diff && rate > best)) {
      best = rate;
      diff = next;
    }
  }
  return best;
}

export function encodeBitrate({ quality, sourceBitrate } = {}) {
  if (quality == null || quality === "" || quality === "320") return 320;
  if (quality !== "original") {
    throw bad("Choose 320 kbps or the original max bitrate.");
  }
  const snapped = nearestMp3Bitrate(sourceBitrate);
  if (!snapped) {
    throw bad("YouTube did not report a bitrate for that video. Use 320 kbps.");
  }
  return snapped;
}

function bad(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
