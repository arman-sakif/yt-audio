import assert from "node:assert/strict";
import test from "node:test";
import { encodeBitrate, nearestMp3Bitrate } from "../lib/bitrate.js";

test("snaps a source bitrate to a standard MP3 rate", () => {
  assert.equal(nearestMp3Bitrate(160), 160);
  assert.equal(nearestMp3Bitrate(129), 128);
  assert.equal(nearestMp3Bitrate(145), 160);
  assert.equal(nearestMp3Bitrate(144), 160);
  assert.equal(nearestMp3Bitrate(400), 320);
  assert.equal(nearestMp3Bitrate(10), 32);
  assert.equal(nearestMp3Bitrate(0), null);
  assert.equal(nearestMp3Bitrate("nope"), null);
});

test("keeps 320 kbps when that option is chosen or omitted", () => {
  assert.equal(encodeBitrate({}), 320);
  assert.equal(encodeBitrate({ quality: "320", sourceBitrate: 128 }), 320);
});

test("uses the video's max bitrate for the original option", () => {
  assert.equal(encodeBitrate({ quality: "original", sourceBitrate: 160 }), 160);
  assert.equal(encodeBitrate({ quality: "original", sourceBitrate: 151 }), 160);
});

test("rejects a missing source bitrate and an unknown quality", () => {
  assert.throws(() => encodeBitrate({ quality: "original" }), (error) => {
    assert.equal(error.status, 400);
    assert.match(error.message, /did not report a bitrate/);
    return true;
  });
  assert.throws(() => encodeBitrate({ quality: "flac" }), (error) => {
    assert.equal(error.status, 400);
    assert.match(error.message, /original max bitrate/);
    return true;
  });
});
