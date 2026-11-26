# 73. An html attachment opens in a sandboxed frame

- **Status:** accepted, 2026-11-26
- **Amends:** [0072](0072-an-attached-file-is-a-child-item.md), "Other files
  download"
- **Applies to:** `src/attachments.ts`, `index.html`, `server/app.ts`,
  `src/style.css`

## Context

Agents attach html pages: reports, mockups, pages with Mermaid diagrams.
A click on one downloaded it, and it had to be opened outside the app. Of
the 16 pages attached when this was decided, two drew Mermaid diagrams with a
script from cdn.jsdelivr.net and one drew charts with a script of its own.

## Decision

- An attachment child whose name ends in `.html` or `.htm`, in any case,
  opens in a full-screen viewer: a bar with the name, Download and Close,
  over a frame holding the page. The stored type cannot tell, since the CLI
  stores html as `application/octet-stream`. The row stays a 📎 file name,
  with no fold and no preview.
- An html link still written in a note downloads, as before; every other file
  downloads too.
- The frame's sandbox is `allow-scripts` and nothing else. Without
  `allow-same-origin` the page gets an origin of its own: its
  `localStorage`, `indexedDB`, `parent.document` and a change of the top
  address are refused. There is no `allow-popups`, since a script could open
  a tab with no click and send data out in its address; forms, modals,
  downloads and top navigation stay off.
- The page is a `data:` URL of a fixed prefix followed by the file's bytes. A
  `data:` page never has the app's origin, even if the sandbox attribute were
  lost, and links to a heading work in it. A file over 1,400,000 bytes gets a
  `blob:` URL instead, since Chromium shows nothing for a `data:` URL over
  2 MB; links to a heading are not expected to jump there.
- The prefix comes before any byte of the file and holds:
  - the page's CSP in a meta tag:
    `default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'`.
    It stops fetch, sockets, beacons, images, styles, fonts, frames and form
    posts to every host, and scripts from every host but the CDN;
  - `no-referrer`;
  - a script that cancels a click on a link that does not start with `#`,
    and posts `{ type: "close-viewer" }` to the app on Escape, since keys
    typed in the frame never reach the app. The app obeys that message only
    from the viewer's own frame.
- The app's page sets `frame-src data: blob:`. The page's own CSP cannot stop
  a frame from sending itself to another address; the app's does, for a
  scripted address change, a meta refresh, a form submit and a link click.
  Plugin frames (`srcdoc`) still run under it.
- `GET /files/HASH` adds `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: sandbox; default-src 'none'` and
  `Content-Disposition: attachment`. It answers with the type the uploader
  sent, `text/html` included, from the app's origin; before this only the
  missing `Authorization` header kept a browser from opening it there.
- Close, Escape and Back close the viewer, which pushes a history state as the
  picture viewer does; Close has focus when it opens. Download saves the
  stored file unchanged, without the prefix. The frame is white behind a page
  that sets no background, in the dark theme too.

## What a page can still do

Accepted with the choice of letting scripts run:

- ask cdn.jsdelivr.net for any script, so the CDN sees the device's address
  and the package asked for;
- hang the tab with a busy loop;
- post messages to the app's window; the plugin host drops what is not from
  a plugin frame;
- draw a form that looks like the app, though what is typed in it cannot be
  sent anywhere.

Images, styles and fonts from the network do not load, and Mermaid diagrams
do not draw offline unless the browser has the script cached.

## Options considered

**No scripts.** Rejected: three of the 16 pages draw nothing without them.

**`srcdoc`.** Rejected: links to a heading load the app itself into the
frame.

**A `blob:` URL for every page.** Rejected: under this sandbox links to a
heading do nothing in it.
