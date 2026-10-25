# Plugins and scripting

Status: decided 2026-10-09: formulas in [ADR 22](../adr/0022-computed-columns-with-formulas.md), plugins in [ADR 30](../adr/0030-plugins-run-sandboxed-once-a-trusted-device-approves-them.md).

## Context

The app should be extensible the way Amplenote is: a note that holds
JavaScript becomes a plugin. Another idea on the table is a small Lisp
whose scripts can be checked statically: expand every macro until only
resource-access nodes remain, then decide from those what the script may
touch.

Constraints from what exists:

- The outline syncs to every device and the CLI (ADR 0011, 0012). A script
  kept in the outline syncs for free, and anything that can write the
  outline can change it. That includes the CLI, which is meant for agents
  (ADR 0014).
- Text is raw text and rendering wraps it (ADR 0003). Rows are rebuilt only
  when their display state changes (ADR 0009).
- No command palette exists yet. `src/palette.ts` drives Jump to and Move
  to; a third use, "run a command", fits it.
- Formulas in columns and capture templates are two of the first things a
  plugin system would be asked to do.

## How others do it

- **Amplenote.** A plugin is a normal note with a settings table (name,
  icon, settings) and a JavaScript code block; editing the note updates the
  plugin. Code runs in a sandboxed iframe, on mobile in a separate WebView.
  It registers actions (`appOption`, `noteOption`, `insertText`,
  `replaceText`, `linkOption`, `renderEmbed`, `onNoteCreated`) and calls an
  async `app.*` API for notes, tasks, prompts and settings.
- **Logseq.** Plugins are packages loaded into a sandboxed iframe and talk
  to the host by `postMessage` through `@logseq/libs`. Every API call is an
  async message.
- **Obsidian.** No sandbox: a plugin has the whole app, the file system and
  the network. Obsidian argues a sandbox would make plugins useless; safety
  rests on plugins being off by default and on review. A plugin was used to
  deliver a remote-access trojan in 2026.
- **Figma.** Started with the Realms shim, which had sandbox escapes, and
  moved to QuickJS compiled to WebAssembly, with UI in a separate iframe.
- **Emacs / org.** Everything is Lisp with full access; the user trusts
  their own config. org-capture templates and column formulas are data
  interpreted by Lisp.

## What scripts would do

In order of value, as far as the planned work shows:

1. **Commands** in a command palette (Mod-K or similar): act on the focused
   item or the selection, e.g. "file under Archive/2026", "sum the effort
   of the subtree into a note line".
2. **Computed properties and columns**, e.g. `start` as the sum of the
   durations of earlier siblings. These run on every render, so they
   must be pure and fast.
3. **Capture templates**: ask for a few values, file a new item at a set
   place.
4. **Render hooks**: change how an item looks. These are the riskiest,
   since they touch row markup and ADR 0009's display state. Keep them to
   returning raw text or chips, never HTML.

A plugin would be an item tagged `#plugin` (or with `plugin:: name`), whose
code sits in a code block in its note or a child, once code blocks exist. Its `key:: value` lines (ADR 0017) declare its name, the
hooks it uses and the permissions it asks for.

## Sandboxing in a browser

| Option                                                                                                | Isolation                                                          | Cost                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Run in the page (`new Function`)                                                                      | none; sees the DOM, storage, the sync token and any encryption key | trivial                                                                                                 |
| Web Worker + message API                                                                              | no DOM, but has `fetch`, IndexedDB and the app's origin            | small; terminable with `worker.terminate()`                                                             |
| Sandboxed iframe (`sandbox="allow-scripts"`, opaque origin, CSP `connect-src 'none'`) + `postMessage` | no app storage, no token, no network unless granted                | small to medium; what Amplenote and Logseq do                                                           |
| ShadowRealm                                                                                           | separate globals, same thread                                      | not usable: still stage 2.7, no browser ships it, Node removed its flag in 2026                         |
| QuickJS in WebAssembly                                                                                | its own interpreter; only the functions we hand in                 | about 0.5 MB wasm, a dependency; memory limits and interrupts have known gaps; same engine runs in Node |
| A small interpreted DSL                                                                               | exactly what the interpreter offers                                | we write parser, interpreter, errors, docs                                                              |

Running in the page is out: a script synced from anywhere, including an
agent through the CLI, would run with the sync token and, later, the key to
encrypted items.

**Trust is per device and per version.** Because the outline syncs, a new or
changed script must not run until it is enabled on this device. Store the
hash of the enabled code in `Prefs` (per device, like the Columns switch).
When the code changes, the plugin stops and asks again, showing what
permissions it wants.

**Permissions are capabilities in the message API**, declared in the plugin
item, e.g. `permissions:: read-subtree write-subtree prompt`. The host only
answers calls the plugin was granted, and limits reads and writes to the
plugin's subtree or the item the command ran on. Network access is a
separate grant, given by relaxing the iframe's CSP for named hosts.

**The CLI.** `outline run PLUGIN COMMAND ITEM` would load the same code
under Node. Node's `vm` is not a security boundary; a `worker_threads`
worker started with Node's permission model (`--permission`, no file
system or child processes) and the same message API is. The CLI already has
full access to the outline, so the risk there is the file system and the
network, not the data.

## The Lisp idea, honestly

The static check works only for a language with no `eval`, no reflection
and no way to build a function name at run time. Then, after macro
expansion, the set of primitive calls is known, and "this script reads
items and never writes" can be proved before it runs.

What it proves is which kinds of access a script uses, not on what. "Writes
only under Inbox" depends on values computed at run time, so the host checks
it at run time anyway. The kinds of access are exactly what a capability
list in the message API already enforces, with no static analysis. So the
check buys a nicer error message before a run, and costs a language:
parser, macro expander, interpreter, error reporting, docs, editor support,
debugging, and a syntax neither a phone keyboard nor most agents
write as fluently as JavaScript.

Where a small language does pay is **pure formulas**. A
formula reads properties of nearby items and returns a value; it has no side
effects, must give the same answer in the app and the CLI, and runs on every
render. An s-expression syntax is the cheapest to parse and makes the "only
these primitives exist" property trivial:

```
start:: (sum (prop duration) (preceding-siblings))
```

So the Lisp is worth building small, as the formula language, not as the
plugin language.

## Options

1. **JavaScript plugins in a sandboxed iframe**, capabilities in the message
   API, enabled per device by code hash. About the size of the sync client:
   a host API, a palette of commands, a plugin list in ⋯. Matches Amplenote.
2. **QuickJS-wasm for everything.** Stronger isolation and the same engine
   in the CLI, at the price of the project's first runtime dependency and
   0.5 MB more to download and cache in the service worker.
3. **A Lisp for everything**, statically checked. The most work; its main
   promise is delivered more cheaply by option 1's capabilities.
4. **Formulas only**: a pure expression language for computed properties,
   no plugins yet. Smallest; leaves commands and capture to built-in code.

## Recommendation

Do 4 first and 1 after it:

- An s-expression formula language for computed properties and columns,
  interpreted by our own code in `src/` so the app and the CLI share it.
  This is the useful core of the Lisp idea and covers formulas in columns.
- Then JavaScript plugins in a sandboxed iframe with an async message API,
  starting with palette commands and capture templates, with permissions
  declared in the plugin item and each version enabled per device.
- Leave render hooks and network access for later; leave QuickJS as the
  fallback if the iframe sandbox turns out to leak.

## Open questions

1. Which comes first: formulas, palette commands, or capture templates?
2. Is s-expression syntax acceptable for formulas, or should they look like
   spreadsheet formulas (`=sum(prev.duration)`)?
3. Should a plugin edited from the CLI (by a person or an agent) need re-enabling
   on each device, or is enabling once per plugin enough?
4. Do plugins need the network (calling an API, fetching a page), and if so
   only for listed hosts?
5. Should the CLI run plugins at all, or should scripts on the CLI side stay
   plain shell scripts around `outline`?
6. Will plugins be shared between people some day, or stay private? Sharing would need a review story like Obsidian's.

## Sources

- [Amplenote plugin API](https://www.amplenote.com/help/developing_amplenote_plugins)
  and [execution environment](https://www.amplenote.com/help/developing_amplenote_plugins/appendix_ii)
- [Logseq plugin API](https://plugins-doc.logseq.com/)
- [Obsidian plugin security](https://obsidian.md/help/plugin-security)
- [Figma: how we built the plugin system](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/),
  [an update on plugin security](https://www.figma.com/blog/an-update-on-plugin-security/)
- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- [ShadowRealm proposal](https://github.com/tc39/proposal-shadowrealm),
  [Node removes ShadowRealm](https://github.com/nodejs/node/pull/65650)
