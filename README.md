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

A line `:key: value` in an item's note is a property, as in org mode
(doc/adr/0017, 0020): `:calories: 350 kcal`, `:effort: 1h30m`,
`:effort: 1:30`, `:protein: 12 g`. Typing `:` at the start of a note line
offers the keys already in use, and `#` offers the tags.
⋯ → Columns (Alt-Shift-C) shows the page's properties as columns, each
parent showing the sum of its children. To choose the columns and how they
roll up, put a `:columns:` property on the page, as in org mode:

```
:columns: calories{+} protein{+} effort{max}
```

`{+}` sums (the default), `{min}`, `{max}` and `{mean}` take the least, most
or average of the children. A page with `:columns:`, and everything under
it, opens in column view. Cells are editable; a click writes the property.

A column with a formula in its braces is computed for every row below the
page that has no value of its own (doc/adr/0022). A day planned as a
timetable:

```
Monday
  :start: 9:00
  :columns: effort start{=parent.start + before(effort)}
```

Each item then starts when the items above it are done, counted from the
parent's start. Formulas take amounts (`350 kcal`, `1h30m`, `9:00`),
`+ - * /`, another column of the row (`effort`), of the parent
(`parent.start`) or the previous sibling (`previous.end`), `before(key)`
over the siblings above, `sum`, `min`, `max`, `mean` over the children, and
`clock(…)` to show a duration as a time.

## Capture

Alt-Shift-N (or ⋯ → Capture…, or Ctrl-K) files a new item without leaving
the page (doc/adr/0023). Any item with a `:capture:` property is a template,
named by its text:

```
Meal
  :capture: Food/{date}
  :ask: kcal protein
  :key: m
  :at: top
```

`:capture:` is a path or an item id (`{date}` is today, missing pages are
created), `:ask:` the properties to ask for, `:key:` the letter that picks
the template, `:at: top` files at the top. Without templates, items go to
`Inbox`.

Straight into capture: long-press the installed app's icon → Capture, or
share a page or text to the app on Android. Any device can open
`<app>/?capture`, `?capture=Meal` or `?capture&text=…` (an iOS Shortcut, a
bookmark). From a shell: `outline capture "Oats" --template Meal --set
kcal=300`.

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
the server address. Elsewhere, install the `outline` package from the flake
(Linux and macOS), or run `node dist-node/outline.mjs` (Node 22 or later).

```sh
nix profile install git+ssh://git@github.com/tino415/outliner.git#outline
```

In a nix-darwin or home-manager configuration, add the repository as a
flake input and the package to the user's packages:

```nix
inputs.outliner.url = "git+ssh://git@github.com/tino415/outliner.git";
# ...
home.packages = [ inputs.outliner.packages.${pkgs.stdenv.hostPlatform.system}.outline ];
```

The package holds neither the server address nor the token. The CLI reads
them from `OUTLINE_SERVER` and `OUTLINE_TOKEN`, or from
`$XDG_CONFIG_HOME/outline/config` (`~/.config/outline/config` by default),
which takes the same names as `KEY=value` lines; the environment wins over
the file:

```sh
mkdir -p ~/.config/outline
cat > ~/.config/outline/config <<'EOF'
OUTLINE_SERVER=https://dev.taile622dc.ts.net:10001
OUTLINE_TOKEN=<the token from .env.sync>
EOF
chmod 600 ~/.config/outline/config
```

After a change to `package-lock.json`, `nix build .#outline` fails with the
new `npmDepsHash`; put it in `nix/outline.nix`.

## Publishing

```sh
dev-run env BUILD_COMMIT=<short sha> npm run build
cp -r dist/. ~/srv/pub/outliner-lab/
```

The build uses relative paths, so it works under any sub-path.
