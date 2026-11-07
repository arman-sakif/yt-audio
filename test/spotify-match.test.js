import assert from "node:assert/strict";
import test from "node:test";
import { pickTrack, searchQueries } from "../lib/spotify-match.js";

function track(id, name, artists, durationMs) {
  return {
    id,
    uri: `spotify:track:${id}`,
    name,
    artists: artists.map((name) => ({ name })),
    duration_ms: durationMs,
  };
}

test("picks the track whose title and artist match", () => {
  const picked = pickTrack(
    [track("1", "Get Lucky", ["Daft Punk", "Pharrell Williams"], 248000)],
    { title: "Get Lucky", artist: "Daft Punk" },
  );
  assert.equal(picked.id, "1");
});

test("rejects a different artist", () => {
  const picked = pickTrack([track("1", "Song", ["Someone Else"], 180000)], {
    title: "Song",
    artist: "Artist",
  });
  assert.equal(picked, null);
});

test("returns nothing when Spotify has no tracks", () => {
  assert.equal(pickTrack([], { title: "Song", artist: "Artist" }), null);
  assert.equal(pickTrack([track("1", "Song", ["Artist"], 180000)], { title: "", artist: "Artist" }), null);
});

test("uses the video length to choose between two copies", () => {
  const picked = pickTrack(
    [
      track("radio", "Song", ["Artist"], 180000),
      track("album", "Song", ["Artist"], 200000),
    ],
    { title: "Song", artist: "Artist", duration: 201 },
  );
  assert.equal(picked.id, "album");
});

test("keeps Spotify's order when the video length is unknown", () => {
  const picked = pickTrack(
    [track("first", "Song", ["Artist"], 180000), track("second", "Song", ["Artist"], 200000)],
    { title: "Song", artist: "Artist" },
  );
  assert.equal(picked.id, "first");
});

test("matches a featured artist and ignores a feat note in the title", () => {
  const picked = pickTrack([track("1", "Song", ["Artist", "Other"], 180000)], {
    title: "Song (feat. Other)",
    artist: "Artist feat. Other",
  });
  assert.equal(picked.id, "1");
});

test("does not treat a remix as the same song", () => {
  const picked = pickTrack([track("1", "Song (Remix)", ["Artist"], 180000)], {
    title: "Song",
    artist: "Artist",
  });
  assert.equal(picked, null);
});

test("treats a leading The and a plus sign as the same artist", () => {
  const picked = pickTrack([track("1", "Dog Days Are Over", ["Florence + The Machine"], 200000)], {
    title: "Dog Days Are Over",
    artist: "Florence and the Machine",
  });
  assert.equal(picked.id, "1");
});

test("searches the full artist credit, then the first name", () => {
  assert.deepEqual(searchQueries("Get Lucky", "Daft Punk feat. Pharrell Williams"), [
    'track:"Get Lucky" artist:"Daft Punk feat. Pharrell Williams"',
    'track:"Get Lucky" artist:"Daft Punk"',
  ]);
});
