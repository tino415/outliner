# 38. Plugins answer events made in this tab

- **Status:** accepted, 2026-10-20
- **Supersedes:** the "no hooks" part of [ADR 30](0030-plugins-run-sandboxed-once-a-trusted-device-approves-them.md)
- **Applies to:** `src/events.ts`, `src/pluginHost.ts`, `src/store.ts`, `src/app.ts`
- **Decides:** the plugin layer of the card "Plugin: add option to query and be triggered by adding node to node" (Projects/Outliner), with Martin's answers of 2026-10-19

## Context

Martin wants a board column that completes the cards dropped into it,
written as a plugin rather than built into the app. ADR 30 left hooks out
because a hook running in every open app would act once per device.

## Decision

**`outline.on(event, handler)`** with four events: `added`, `moved`,
`completed` (also on reopening) and `changed` (text, note or a property).
The handler gets `{ item, from, to }`: for `moved` the old and the new
parent, for `added` the new parent as `to`, otherwise `null`. Events come
from comparing the outline before and after a change, one per item;
children carried along with an added or moved item fire nothing.

**Only changes made in this tab fire**: typing, dragging, the keyboard,
commands. Not undo or redo, not another tab or device, and not a
handler's own changes, so two devices never answer the same move and a
handler cannot loop. Each change is tagged with where it came from
(`ChangeOrigin`) for this.

**A handler's changes join the undo step of the change that fired it**,
if nothing else was committed in between (`History.commitJoining`);
otherwise they are a step of their own. One Ctrl-Z takes back the move
and the completion together.

**Reach is that of commands**: the item and what is under it. The old and
new parent are readable, not writable, so a plugin can see a column's
`:completes:`. The full set of calls is now `item`, `setText`, `setNote`,
`setProperty`, `add`, `complete(item, done)` and `toast`; there is no
`move`.

**A plugin's commands and handlers run one at a time** in its sandbox, so
calls made after an `await` still act for the run that made them.

**The Plugins dialog names the events a plugin listens to**, read from its
code, so they show before it is approved.

## Options considered

**Events from other devices too.** Every open device would answer the
same synced move. Scripts with `outline watch` are the way to react to
changes made anywhere.

**A declared selector**, `outline.on("moved", { to: { property: … } }, …)`.
Filtering inside the handler is enough for now; a selector can be added
later without other changes.

**`outline.move`.** It reaches outside the item's own subtree, and the
`:completes:` example does not need it.

## Consequences

- A move made from the CLI, by an agent or on an untrusted device fires
  nothing, even while the app is open on a trusted one.
- A busy `changed` listener gets a message for every keystroke.
