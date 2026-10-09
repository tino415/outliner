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
podman compose exec app npm install                 # once, into the node_modules volume
podman compose exec app npm run dev                 # http://127.0.0.1:5188/
```

`podman compose exec app` sends a command into this checkout's `app` container.

## Checking it

```sh
podman compose exec app npx tsc --noEmit
podman compose exec app npx vitest run              # tree operations, import/export, inline rendering
podman compose exec app npm run build               # the browser tests run against the build
podman compose exec app npx playwright test         # desktop Chromium, phone, WebKit, Firefox
```

`e2e/screenshots.spec.ts` writes the screenshots in `screenshots/`.

## Properties and columns

A line `:key: value` in an item's note is a property, as in org mode
(doc/adr/0017, 0020): `:calories: 350 kcal`, `:effort: 1h30m`,
`:start: 9:00` (a time of day), `:protein: 12 g`. Typing `:` at the start of a note line
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
parent's start. An item with its own `:start:` keeps it; the items after
it still count from the parent's start.
A formula that cannot be computed shows `error`, the reason on hover.
⋯ → Formula help (or Ctrl-K, `>formula`) lists the syntax below, with
example pages it adds to the current page.
Formulas take amounts (`350 kcal`, `1h30m`, `9:00`),
`+ - * /`, another column of the row (`effort`), of the parent
(`parent.start`) or the previous sibling (`previous.end`), `before(key)`
over the siblings above, `sum`, `min`, `max`, `mean` over the children, and
`clock(…)` to show a duration as a time. A hyphen followed by a letter is
part of a key (`time-spent`); write `effort - 15m` or `effort-15m` to subtract.
A time plus a duration is a time, a time minus a time a duration; numbers
in different units do not add.

## Boards

Alt-Shift-B (or ⋯ → Board) shows the page as a Kanban board: its children
are the columns, theirs the cards (doc/adr/0031). It writes `:view: board`
into the page's note, so the page is a board on every device and the CLI
still sees an ordinary outline. Cards are edited in place like any item;
drag one by its handle (mouse or finger) or press Alt-Shift-← / → to move
it to the next column. The buttons add cards and columns.

## Kinds

An item that starts with one to three capitalised words of letters and a
colon, as `Question: …` or `Needs you: …`, shows them as a dark badge
(doc/adr/0027). Typing at the start of an item offers the kinds in use;
Alt-Shift-K sets or removes the kind from anywhere in the item and leaves
the caret where it was. A click on a badge searches for it. The text stays
plain, so the CLI and search read `Question:` as written.

## Order of new and completed items

`:completed: last` on a page shows completed items after the open ones,
on that page and every page below it (`:completed: in place` turns it off
further down). Only the display changes; the CLI shows the same order.
`:new: top` on a page files new children at the top: the + button,
capture (unless the template says `:at:`) and `outline add --under`.
Alt-Shift-Enter adds a first child to any item.

## Links between items

Type `[[` or press Alt-Shift-L to link to another item: it writes
`[[id:…][label]]`, as org mode does (doc/adr/0024). `[[Some text]]` links to
the first item with that text. A click follows a link; a zoomed item lists
what links to it under its title.

## Attachments

Paste an image into an item, drop files on it, or press Alt-Shift-A (also
in the item menu) to attach files (doc/adr/0028). Each becomes a line in
the note, `![glitch.png](att:<sha256>)`; images show as pictures. Files are
kept in the browser and uploaded to the sync server on the next sync. From
a shell:

```sh
bin/outline attach "Outliner/TODO/Some bug" screenshot.png
bin/outline file <sha256> /tmp/screenshot.png   # the hash after att: in a note
```

## Private items

Alt-Shift-P (or Make private… in the item menu) puts `:private: <key>` in an
item's note: its note and everything under it are encrypted with that key
before they are synced (doc/adr/0029). The headline stays readable.
Devices without the key, the server and the CLI see only the headline and
a lock; the CLI refuses to write into it. Keys live in each browser: ⋯ →
Private keys makes one and shows it as a line to copy to your other
devices, where Add opens what is already there. There is no recovery: keep
a copy of each key.

## Plugins

A plugin is an item with `:plugin: <name>` and JavaScript in a ```js block
of its note (doc/adr/0030):

````
Tools
  :plugin: tools
  ```js
  outline.command("Shout", async (item) => outline.setText(item.id, item.text.toUpperCase()))
  ```
````

Its commands appear in Ctrl-K as `tools: Shout` and act on the item being
edited and what is under it (`outline.item`, `setText`, `setNote`, `add`,
`toast`). It runs in a sandbox without network, and only after a trusted
device approved this exact code in ⋯ → Plugins; changing the code, from
anywhere, stops it until it is approved again. A device is trusted when it
has the key `trust` (Make it trusted, then copy it with ⋯ → Private keys).

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
podman compose exec app npm run build               # builds dist-node/server.mjs and outline.mjs
podman compose up -d --build sync   # listens on 127.0.0.1:8791
tailscale serve --bg --https=10001 http://127.0.0.1:8791
```

In the app: ⋯ → Sync…, server `https://server.example.ts.net:10001`, and the
token from `.env.sync`. The first device uploads its outline; every device
after it switches to the server's outline.

Back up the database by copying `/data/outline.db` out of the `sync`
container.

The flake also builds the server, as `outline-sync-server`, taking the same
settings as the container (`OUTLINE_TOKEN`, `OUTLINE_DB`, `PORT`, `HOST`):

```sh
OUTLINE_TOKEN=… OUTLINE_DB=$HOME/outline.db PORT=8791 HOST=127.0.0.1 \
  nix run git+ssh://git@github.com/tino415/outliner.git#outline-sync-server
```

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
OUTLINE_SERVER=https://server.example.ts.net:10001
OUTLINE_TOKEN=<the token from .env.sync>
EOF
chmod 600 ~/.config/outline/config
```

After a change to `package-lock.json`, `nix build .#outline` fails with the
new `npmDepsHash`; put it in `nix/outline.nix`.

## Publishing

```sh
podman compose exec app env BUILD_COMMIT=<short sha> npm run build
cp -r dist/. a static host directory
```

The build uses relative paths, so it works under any sub-path.
