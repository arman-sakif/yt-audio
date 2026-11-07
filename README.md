# YouTube to MP3

A local page that turns one YouTube link into an MP3. Choose 320 kbps, or the video's original max bitrate. Song title and artist are guessed from the video title, and you can edit them before they are written into the file.

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

## Spotify Liked Songs

A download can also save that song to your Spotify Liked Songs. The MP3 still downloads if Spotify cannot find a match or is unavailable.

Spotify has to authorize the app once:

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app. A personal app in development mode is enough for your own account.
2. The Spotify account that owns the app needs Premium. If Premium lapses, Spotify rejects the save.
3. In the app settings, add this redirect URI with no port number: `http://127.0.0.1/api/spotify/callback`
4. Copy `data/spotify.example.json` to `data/spotify.json` and paste the Client ID into `clientId`. No client secret is used.

Restart the page, look up a video, and choose **Connect Spotify**. After that, **Also save to Spotify Liked Songs** is checked. Uncheck it for a download that should not be saved. **Disconnect** forgets the login on this computer.

The save uses the song title and artist in the form. It only saves a Spotify track when those agree. The video length picks between copies of the same song.

## Quality

After you look up a video, choose the MP3 bitrate:

- **320 kbps** encodes YouTube's best audio to a 320 kbps MP3.
- **Original max bitrate** encodes that same audio at the bitrate of the best stream on the video. The rate is snapped to the nearest standard MP3 rate, from 32 up to 320.

YouTube's best audio is usually Opus or AAC around 128–160 kbps. The page shows that rate on the original option. Both choices are MP3 files, so they play in ordinary music apps. A higher MP3 rate stores the same YouTube audio; it cannot add detail the upload never had.

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
