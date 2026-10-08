# Outliner

A WorkFlowy-style outliner that lives in the browser: nested bullets, zoom,
search, keyboard editing, light and dark themes, installable and offline. The
outline is stored in `localStorage` and never leaves the browser.

Scope, cut list and the session report are in [NOTES.md](NOTES.md); the
decisions behind the code are in [doc/adr](doc/adr/README.md).

## Running it

Everything runs in the `app` service of the Compose stack; nothing is
installed on the host.

```sh
podman compose up -d --build        # once
dev-run npm install                 # once, into the node_modules volume
dev-run npm run dev                 # http://127.0.0.1:5188/
```

`dev-run` sends a command into this checkout's `app` container.

## Checking it

```sh
dev-run npx tsc --noEmit
dev-run npx vitest run              # tree operations, import/export, inline rendering
dev-run npm run build               # the browser tests run against the build
dev-run npx playwright test         # desktop Chromium, phone, WebKit, Firefox
```

`e2e/screenshots.spec.ts` writes the screenshots in `screenshots/`.

## Properties and columns

A line `key:: value` in an item's note is a property (doc/adr/0017):
`calories:: 350 kcal`, `effort:: 1h30m`, `effort:: 1:30`, `protein:: 12 g`.
⋯ → Columns (Alt-Shift-C) shows the page's properties as columns, each
parent showing the sum of its children. To choose the columns and how they
roll up, put a `columns::` property on the page, as in org mode:

```
columns:: calories{+} protein{+} effort{max}
```

`{+}` sums (the default), `{min}`, `{max}` and `{mean}` take the least, most
or average of the children. A page with `columns::`, and everything under
it, opens in column view. Cells are editable; a click writes the property.

## Sync server

The `sync` service keeps the outline for every device and the CLI
(doc/adr/0011 to 0015). It runs the bundled server from `dist-node/` with its
database on the `outliner-lab_sync_data` volume.

```sh
sh scripts/new-sync-token.sh        # once: writes .env.sync with a random token
dev-run npm run build               # builds dist-node/server.mjs and outline.mjs
podman compose up -d --build sync   # listens on 127.0.0.1:8791
tailscale serve --bg --https=10001 http://127.0.0.1:8791
```

In the app: ⋯ → Sync…, server `https://dev.taile622dc.ts.net:10001`, and the
token from `.env.sync`. The first device uploads its outline; every device
after it switches to the server's outline.

Back up the database by copying `/data/outline.db` out of the `sync`
container.

## CLI

```sh
bin/outline show                          # the whole outline
bin/outline show "Projects/Garden" --ids
bin/outline find "#ideas" --json
bin/outline add "Buy seeds" --under Projects --note "before March"
printf '%s\n' "- Week" "  - Monday" | bin/outline add - --under Plans
bin/outline set "Week 41/Monday/Lunch/Soup" calories 250 kcal
bin/outline show "Week 41" --columns      # a table, parents summing their children
bin/outline done <id>
bin/outline move <id> --under Archive
bin/outline move <id> --after "Projects/Garden"   # beside it, under its parent
bin/outline add "Call the plumber" --before "Inbox/Pay rent"
bin/outline export --opml > outline.opml
bin/outline help
```

`bin/outline` runs the CLI in the `app` container, which has the token and
the server address. Elsewhere, run `node dist-node/outline.mjs` with
`OUTLINE_SERVER` and `OUTLINE_TOKEN` set.

## Publishing

```sh
dev-run env BUILD_COMMIT=<short sha> npm run build
cp -r dist/. ~/srv/pub/outliner-lab/
```

The build uses relative paths, so it works under any sub-path.
