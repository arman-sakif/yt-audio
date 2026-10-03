# YouTube to MP3

A local page that turns one YouTube link into a 320 kbps MP3. Song title and artist are guessed from the video title, and you can edit them before they are written into the file.

## Run

[Node.js 22 or newer](#install-nodejs) is required.

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

## Install Node.js

This is the only program you need to install. The first launch of the app downloads yt-dlp and ffmpeg for you.

1. Open [nodejs.org](https://nodejs.org).
2. Download the Windows installer labeled LTS. Its version number needs to be 22 or newer.
3. Run the installer and accept the defaults. Those defaults add `node` to your PATH.
4. Close any open terminal windows so they pick up the new command.

Check the install from a new PowerShell window:

```powershell
node --version
```

The number it prints should be 22 or higher. Then go back to [Run](#run).

From PowerShell, this installs the same LTS release:

```powershell
winget install OpenJS.NodeJS.LTS
```
