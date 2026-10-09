# 30. Plugins run sandboxed, once a trusted device approves their code

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/plugins.ts`, `src/pluginHost.ts`, ⋯ → Plugins
- **Decides:** the plugin half of [doc/design/plugins-and-scripting.md](../design/plugins-and-scripting.md) (formulas were ADR 22), with Martin's answers in the outline (Outliner/TODO/Plugins and scripting)

## Context

Martin wants plugins kept in the outline, like Amplenote's. The outline
syncs to every device and the CLI, which agents use, so anyone with the
token can change a plugin's code. His answers: a changed plugin must be
approved again, approvals from his phone or his browser should count
everywhere, the CLI is not trusted; no network for now; plugins are only
his.

## Decision

**A plugin is an item with `:plugin: <name>` and a ```js block in its
note.** Its code calls `outline.command(label, action)` to add commands to
Ctrl-K; an action gets the item it runs on and can call `outline.item`,
`setText`, `setNote`, `add` and `toast`, all asynchronous messages.

**It runs in a sandboxed iframe**: `sandbox="allow-scripts"` gives it an
opaque origin, so no access to the page, this device's storage, the sync
token or the private-item keys; a `default-src 'none'` policy leaves it no
network. The app answers only the calls above, and only for the item the
command runs on and what is under it.

**Approval is an HMAC of the code with the key named `trust`**, written
into the plugin item as `:approved:`. A trusted device is one that has that
key (⋯ → Plugins → Make it trusted, then copied with ⋯ → Private keys).
A device runs a plugin only if its approval matches the code under the
device's own `trust` key. The CLI and agents have no such key, so they
cannot approve; any change to the code, from anywhere, stops the plugin on
every device until a trusted device approves the new code, after showing
it.

## Options considered

**Approval per device, kept in Prefs** (the design note's proposal).
Martin wanted one approval on a trusted device to count everywhere.

**Approval as a plain property.** Anyone with the token, an agent
included, could write it.

**Running plugins in the CLI, and hooks such as "an item was added".**
Left out: a hook running in every app would act once per device, and the
CLI would need a sandbox of its own under Node. Commands run where Martin
starts them.

## Consequences

- An untrusted device (no `trust` key) runs no plugins at all.
- A plugin can still damage what is under the item it runs on; undo
  covers it like any edit.
- The approval is as safe as the `trust` key; whoever can change the app's
  code on the server can still do anything (doc/design/encrypted-items.md,
  threat model).
