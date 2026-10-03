# YouTube to MP3

A local page that turns one YouTube link into a 320 kbps MP3. Song title and artist are guessed from the video title, and you can edit them before they are written into the file.

## Run

Node.js 22 or newer is required.

Double-click `start.cmd`, or from this folder run:

```
node server.js
```

Leave that window open while you use the page. Close the window, or press Ctrl+C, to stop.

The page opens at <http://127.0.0.1:3847>. If the browser does not open on its own, go to that address.

On this PC, PowerShell blocks `npm start`. Use `node server.js` or `npm.cmd start` instead.

The first launch needs a network connection. It downloads yt-dlp and ffmpeg into `bin/` (about 200 MB). Later launches reuse those files.

The browser saves each MP3 to your Downloads folder. Nothing is kept in this project.

## Quality

YouTube's best audio is usually Opus or AAC around 128–160 kbps. This app encodes that stream once to a 320 kbps MP3 so it plays everywhere. The higher MP3 bitrate does not recreate detail YouTube never sent.

## Tests

```
node --test
```

Only download audio you have the right to keep.
