import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { safeFilename, songFilename, uniqueFilename } from "../lib/filenames.js";
import { suggestMetadata } from "../lib/metadata.js";
import { assertYouTubeUrl } from "../lib/youtube-url.js";

test("splits artist and song and drops official-video decorations", () => {
  const result = suggestMetadata({
    title: "Daft Punk - Get Lucky (Official Music Video)",
    channel: "Daft Punk",
  });
  assert.deepEqual(result, {
    title: "Get Lucky",
    artist: "Daft Punk",
    source: "title",
  });
});

test("drops bracketed audio and visualizer labels", () => {
  assert.equal(
    suggestMetadata({ title: "Aphex Twin - Xtal [Official Audio]" }).title,
    "Xtal",
  );
  assert.equal(
    suggestMetadata({ title: "Artist - Song (Visualizer)" }).title,
    "Song",
  );
  assert.equal(suggestMetadata({ title: "Artist - Song (MV) [HD]" }).title, "Song");
  assert.equal(
    suggestMetadata({ title: "Artist - Song (Lyrics)" }).title,
    "Song",
  );
});

test("keeps remaster, live, and feature notes", () => {
  const result = suggestMetadata({
    title: "Artist - Song (Remastered 2011) (Live) (feat. Other)",
  });
  assert.equal(result.artist, "Artist");
  assert.equal(result.title, "Song (Remastered 2011) (Live) (feat. Other)");
});

test("splits on en dashes and strips a trailing official-video phrase", () => {
  const result = suggestMetadata({ title: "Artist – Song Official Video" });
  assert.equal(result.artist, "Artist");
  assert.equal(result.title, "Song");
});

test("uses a Topic channel when the title has no artist", () => {
  const result = suggestMetadata({
    title: "Garden Song (Official Video)",
    channel: "Phoebe Bridgers - Topic",
  });
  assert.deepEqual(result, {
    title: "Garden Song",
    artist: "Phoebe Bridgers",
    source: "channel",
  });
});

test("strips VEVO from the channel name", () => {
  const result = suggestMetadata({
    title: "Song Name",
    channel: "ArtistVEVO",
  });
  assert.equal(result.artist, "Artist");
  assert.equal(result.title, "Song Name");
  assert.equal(result.source, "channel");
});

test("uses YouTube track and artist only when the title does not split", () => {
  const fromTags = suggestMetadata({
    title: "Some Upload",
    channel: "A Channel",
    track: "Real Song",
    artist: "Real Artist",
  });
  assert.deepEqual(fromTags, {
    title: "Real Song",
    artist: "Real Artist",
    source: "youtube",
  });

  const fromTitle = suggestMetadata({
    title: "Real Artist - Real Song",
    track: "Wrong",
    artist: "Also Wrong",
  });
  assert.equal(fromTitle.source, "title");
  assert.equal(fromTitle.artist, "Real Artist");
});

test("empty info still returns empty strings", () => {
  assert.deepEqual(suggestMetadata({}), {
    title: "",
    artist: "",
    source: "channel",
  });
});

test("filenames drop Windows-illegal characters and reserved names", () => {
  assert.equal(safeFilename('a<b>c:d"e/f\\g|h?i*j'), "abcdefghij");
  assert.equal(safeFilename("  trailing dots... "), "trailing dots");
  assert.equal(safeFilename("CON"), "_CON");
  assert.equal(songFilename({ artist: "A", title: "B", fallback: "x" }), "A - B");
  assert.equal(songFilename({ artist: " ", title: "", fallback: "Video Title" }), "Video Title");
  assert.equal(songFilename({ artist: "", title: "", fallback: "" }), "audio");
});

test("duplicate names gain a counter", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yt-audio-name-"));
  try {
    await writeFile(path.join(dir, "Song.mp3"), "");
    await writeFile(path.join(dir, "Song (2).mp3"), "");
    assert.equal(await uniqueFilename(dir, "Song", ".mp3"), "Song (3).mp3");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("accepts video links and rejects other pages", () => {
  assert.equal(
    assertYouTubeUrl("https://youtu.be/jNQXAC9IVRw"),
    "https://youtu.be/jNQXAC9IVRw",
  );
  assert.equal(
    assertYouTubeUrl("https://music.youtube.com/watch?v=jNQXAC9IVRw&list=abc").includes("v=jNQXAC9IVRw"),
    true,
  );
  assert.equal(
    assertYouTubeUrl("https://www.youtube.com/shorts/jNQXAC9IVRw").includes("/shorts/jNQXAC9IVRw"),
    true,
  );
  assert.throws(() => assertYouTubeUrl("https://vimeo.com/123456"), /Only YouTube/);
  assert.throws(() => assertYouTubeUrl("https://www.youtube.com/playlist?list=abc"), /one video/);
  assert.throws(() => assertYouTubeUrl("not a url"), /doesn't look like a link/);
});
