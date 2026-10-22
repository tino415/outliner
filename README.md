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
dev-run npm run check               # all of it: build, unit suite, every Playwright project, unlisted skips
dev-run npx playwright test         # desktop Chromium, phone, iPhone (WebKit), Firefox
dev-run env WEBKIT=1 npx playwright test   # also desktop Safari (WebKit), which crashes in the container
```

`e2e/screenshots.spec.ts` writes the screenshots in `screenshots/`.

## Keyboard

Ctrl-K (⌘K on a Mac) searches items and commands at once, each command
with its keys; Tab narrows it to Items or Commands, and Ctrl-Shift-K opens
it on Commands. Ctrl-J (⌘J) is a prefix, as C-x in Emacs: then T tag,
P property, K kind, L link, R mirror, ; date, A attach, X private, M move to,
D duplicate, B board, G agenda, C columns, N capture, and J again to jump
to an item. Pausing after it shows what can follow; ? lists every shortcut.
Alt-Shift with a letter is left to typing, as many layouts need it.

Shortcuts can be changed in the outline (doc/adr/0040), so the change
reaches every device. Give any item the property `shortcuts: on`; each
other property on it is a command name, as ? shows beside each command,
and its keys: `tag: Mod+j g`, `zoom-in: Ctrl+]`, several separated by
commas, `none` to unbind. Mod is ⌘ on a Mac and Ctrl elsewhere. A setting
replaces the command's keys and takes them from any command that had them.
Keys that type, that the browser keeps (Mod-N, T, W), copy and paste, or
`Mod+j` alone are refused; ? lists what was refused and why. From a shell:
`outline set "Settings/Shortcuts" tag "Mod+j g"`.

## Properties and columns

An item's properties are `key: value` pairs such as `calories: 350 kcal`,
`effort: 1h30m`, `start: 9:00` (a time of day) or `protein: 12 g`, shown
as chips under its text (doc/adr/0032). The + at the right end of the
item being edited or under the mouse, Ctrl-; (⌘; on a Mac), Set a
property… in the item menu or the Property button in the phone's toolbar
asks for a key, then a value, offering the ones in use; a click on a chip
changes or removes it. Each property syncs on its own. Typing a line
`:calories: 350 kcal` into a note still works: it becomes a property when
the note is left. Exports write properties as such lines, as org mode does.
⋯ → Columns (Ctrl-J C) shows the page's properties as columns, each
parent showing the sum of its children. To choose the columns and how they
roll up, put a `columns` property on the page, as in org mode:

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
it still count from the parent's start. A value starting with `=` is a
formula of the item's own, in any property and with or without columns:
`effort: =24:00 - start` on the last item of a day fills the rest of it.
Its chip shows the result, the formula on hover.
A formula that cannot be computed shows `error`, the reason on hover.
⋯ → Formula help (or Ctrl-K, `formula`) lists the syntax below, with
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

Ctrl-J B (or ⋯ → Board) shows the page as a Kanban board: its children
are the columns, theirs the cards (doc/adr/0031). It sets the page's `view`
property to `board`, so the page is a board on every device and the CLI
still sees an ordinary outline. Cards are edited in place like any item;
drag one by its handle (mouse or finger) or press Alt-Shift-← / → to move
it to the next column. The buttons add cards and columns.

## Kinds

An item that starts with one to three capitalised words of letters and a
colon, as `Question: …` or `Needs you: …`, shows them as a dark badge
(doc/adr/0027). Typing at the start of an item offers the kinds in use;
Ctrl-J K sets or removes the kind from anywhere in the item and leaves
the caret where it was. A click on a badge searches for it. The text stays
plain, so the CLI and search read `Question:` as written.

## Tags

A word with a `#` in front is a tag, in an item's text or its note: it
shows as a chip, a click searches for it, and typing `#` offers the tags in
use. The `#` must start a line or follow a space or an opening bracket, and
the tag needs a letter, so `.#flake`, `a#b` and `#123` stay plain text.
`\#word` writes a plain `#word` (the backslash shows only while editing), and
so does anything in backticks.

## Dates

A date is written as ISO text, `2026-10-14` or `2026-10-14 9:00`, in an
item, a note or a property, and shows as a chip: "today", "tomorrow",
"Tue 14 Oct", red once past (doc/adr/0036). Ctrl-J ; (⌘J ;) or typing `!!`
asks for a date and writes it at the caret: `tomorrow`, `fri`, `+3d`, `2w`,
`14.10.`, `14 oct`, `25` (the next 25th), each with an optional `9:00`. A
click on a chip changes or removes it. The properties `scheduled` and
`due` take their value from the same picker. Search understands
`due:today`, `due:<+7d`, `scheduled:this-week`, `date:>=2026-10-01` (any
date of the item: `scheduled`, `due` or one in its text) and `is:overdue`
(open, every date passed).

## Agenda

⋯ → Agenda (Ctrl-J G) lists, from all over the outline, the open items
whose dates have passed, then each day of the coming week with the items
dated on it, then the `#todo` items without a date (doc/adr/0037). An
item's dates are its `scheduled` and `due` properties and the dates in its
text. The rows are the items themselves: edit, complete or date them in
place; the line under each says where it lives and goes there. Keys that
would move an item in the outline do nothing in the agenda.

## Query views

An item with a `:query:` property is a view: its page lists the items that
match from all over the outline, under the path to where they live, in
place of its children (doc/adr/0044). `:group: date` lists them by date
instead, as the agenda does. The rows work as in the agenda.

```
:query: #feature is:open under:"Projects/Outliner" -draft
:query: #bug OR #todo due:<+7d
```

Plain words, `#tag`, `is:open`, `is:done`, `is:overdue`, `has:key`,
`under:A/B`, the date words of search, `-` before any of them, and `OR`
between alternatives. `outline find QUERY --query` answers the same
language.

## Order of new and completed items

`:completed: last` on a page shows completed items after the open ones,
on that page and every page below it (`:completed: in place` turns it off
further down). Only the display changes; the CLI shows the same order.
`:new: top` on a page files new children at the top: the + button,
capture (unless the template says `:at:`) and `outline add --under`.
Alt-Shift-Enter adds a first child to any item.

## Links between items

Type `[[` or press Ctrl-J L to link to another item: it writes
`[[id:…][label]]`, as org mode does (doc/adr/0024). `[[Some text]]` links to
the first item with that text. A click follows a link; a zoomed item lists
what links to it under its title.

Ctrl-J R (or "Mirror here" in Ctrl-K) puts a mirror of another item here
(doc/adr/0043): a row with a hollow bullet that shows the item's text and
children, live and read-only, with its path on hover. Its bullet zooms to
the item, Enter or a tap on its text opens it; deleting it leaves the item,
and a mirror of a deleted item shows "gone". On a blank item the item
becomes the mirror, otherwise the mirror goes below. Sync, export and the
CLI see an ordinary item with a `mirror: <id>` property.

## Attachments

Paste an image into an item, drop files on it, or press Ctrl-J A (also
in the item menu) to attach files (doc/adr/0028). Each becomes a line in
the note, `![glitch.png](att:<sha256>)`; images show as pictures. Files are
kept in the browser and uploaded to the sync server on the next sync. From
a shell:

```sh
outline attach "Outliner/TODO/Some bug" screenshot.png
outline file <sha256> /tmp/screenshot.png   # the hash after att: in a note
```

## Private items

Ctrl-J X (or Make private… in the item menu) sets the item's `private`
property to a key: its note, properties and everything under it are
encrypted with that key before they are synced (doc/adr/0029). The
headline stays readable. Devices without the key, the server and the CLI see only the headline and
a lock; the CLI refuses to write into it. Keys live in each browser: ⋯ →
Private keys makes one and shows it as a line to copy to your other
devices, where Add opens what is already there. There is no recovery: keep
a copy of each key.

## Plugins

A plugin is an item with a `plugin` property naming it and JavaScript in a
```js block of its note (doc/adr/0030); typed as lines, it reads:

````
Tools
  :plugin: tools
  ```js
  outline.command("Shout", async (item) => outline.setText(item.id, item.text.toUpperCase()))
  ```
````

Its commands appear in Ctrl-K as `tools: Shout` and act on the item being
edited and what is under it:

- `outline.item(item)` reads `{id, text, note, properties, children, completed}`
- `outline.setText(item, text)`, `setNote(item, note)`
- `outline.setProperty(item, key, value)`, an empty value removing it; not
  `private`, `plugin` or `approved`
- `outline.complete(item, done)`, `done` false reopening it
- `outline.add(parent, text)` adds a child and returns its id
- `outline.toast(message)`

Each takes an item as the action got it or its id, and returns a promise; a
failed call shows its error as a toast, awaited or not.

`outline.on(event, handler)` runs a handler by itself when an item is
`added`, `moved`, `completed` (or reopened) or `changed` (text, note or a
property) in this tab (doc/adr/0038). It gets `{item, from, to}`: for a
move the old and new parent, for an addition the parent as `to`; it may
read those and change the item and what is under it. Undo, redo, other
devices and a handler's own changes fire nothing, and what a handler does
is undone with the change that fired it. A board column with
`:completes: yes` that completes the cards put into it, and reopens those
taken out:

```js
const completes = (column) => column?.properties.completes === "yes";
outline.on("moved", async ({ item, from, to }) => {
  if (completes(to) && !item.completed) await outline.complete(item, true);
  if (completes(from) && !completes(to) && item.completed) await outline.complete(item, false);
});
outline.on("added", async ({ item, to }) => {
  if (completes(to) && !item.completed) await outline.complete(item, true);
});
```

A plugin runs in a sandbox without network, and only after a trusted
device approved this exact code in ⋯ → Plugins; changing the code, from
anywhere, stops it until it is approved again. A device is trusted when it
has the key `trust` (Make it trusted, then copy it with ⋯ → Private keys).

## Capture

Ctrl-J N (or ⋯ → Capture…, or Ctrl-K) files a new item without leaving
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

The sync server keeps the outline for every device and the CLI
(doc/adr/0011 to 0015). On dev it is the NixOS service `outline-sync`
(doc/adr/0042): `nix/module.nix`, imported by the machine's
`configuration.nix` from this repository at a pinned commit. It listens on
127.0.0.1:8791, keeps its database in `/var/lib/outline-sync/outline.db` and
reads `OUTLINE_TOKEN=…` from the file given as `environmentFile`.

```nix
services.outline-sync = {
  enable = true;
  environmentFile = "/var/lib/outline-sync-token.env";
};
```

```sh
sh scripts/new-sync-token.sh        # once: writes .env.sync with a random token
tailscale serve --bg --https=10001 http://127.0.0.1:8791
```

In the app: ⋯ → Sync…, server `https://dev.taile622dc.ts.net:10001`, and the
token from `.env.sync`. The first device uploads its outline; every device
after it switches to the server's outline.

A new server version reaches dev when `rev` in `configuration.nix` names a
commit that has it and the machine is rebuilt. Back up the database first:
stop the service and copy `outline.db` out of `/var/lib/outline-sync/`.

Elsewhere the flake runs the server as `outline-sync-server`, with
`OUTLINE_TOKEN`, `OUTLINE_DB`, `PORT` and `HOST`, and `Dockerfile.sync`
builds it into an image:

```sh
OUTLINE_TOKEN=… OUTLINE_DB=$HOME/outline.db PORT=8791 HOST=127.0.0.1 \
  nix run github:tino415/outliner#outline-sync-server
```

## CLI

```sh
outline show                          # the whole outline
outline show "Projects/Garden" --ids
outline find "#ideas" --json
outline find "#feature is:open under:Projects/Outliner" --query
outline add "Buy seeds" --under Projects --note "before March"
printf '%s\n' "- Week" "  - Monday" | outline add - --under Plans
outline set "Week 41/Monday/Lunch/Soup" calories 250 kcal
outline show "Week 41" --columns      # a table, parents summing their children
outline done <id>
outline move <id> --under Archive
outline move <id> --after "Projects/Garden"   # beside it, under its parent
outline add "Call the plumber" --before "Inbox/Pay rent"
outline export --opml > outline.opml
outline watch --json                  # a line per change, made anywhere, until stopped
outline help
```

`outline watch` asks the server for what is newer every 5 seconds
(`--every N`) and prints each change made from then on, on any device:
`{"event":"moved","id":…,"from":…,"to":…}`, and `added`, `completed`
(also reopening) and `changed`, as plugins get them (doc/adr/0039).
Private items print nothing. A script does the rest with `jq` and the
other commands; this one is the `:completes: yes` plugin of the Plugins
section, for moves made anywhere:

```sh
completes() { [ -n "$1" ] && outline show "$1" --json --depth 0 | jq -e '.properties.completes == "yes"' >/dev/null; }
outline watch --json | jq --unbuffered -c 'select(.event == "moved" or .event == "added")' |
  while read -r event; do
    id=$(jq -r .id <<<"$event")
    from=$(jq -r '.from // ""' <<<"$event")
    to=$(jq -r .to <<<"$event")
    done=$(outline show "$id" --json --depth 0 | jq -r '.completed // false')
    if completes "$to"; then [ "$done" = true ] || outline done "$id" >/dev/null
    elif completes "$from" && [ "$done" = true ]; then outline undone "$id" >/dev/null; fi
  done
```

Its own `outline done` comes back as a `completed` event, which it does
not listen to. Where it runs it has the token, with no sandbox or approval.

On dev, `llm`'s home-manager installs `outline` from this repository at the
commit the server runs, and `~/.config/outline/config` names
`http://127.0.0.1:8791` and the token. Elsewhere, install the `outline`
package from the flake (Linux and macOS), or run `node dist-node/outline.mjs`
(Node 22 or later).

```sh
nix profile install github:tino415/outliner#outline
```

In a nix-darwin or home-manager configuration, add the repository as a
flake input and the package to the user's packages:

```nix
inputs.outliner.url = "github:tino415/outliner";
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
