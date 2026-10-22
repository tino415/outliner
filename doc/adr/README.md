# Decision records

One file per decision that was argued rather than obvious, numbered in the
order it was taken. A record says what was decided, what it cost and what was
rejected. What the code does, the code says.

A record is not edited once accepted. A later decision supersedes it in a new
file that says so.

`NOTES.md` at the repository root holds the scope, the cut list and the
session report; the records here hold the choices behind them.

1. [Plain TypeScript, no UI framework](0001-plain-typescript-no-ui-framework.md)
2. [One immutable document, re-rendered on structure, never on typing](0002-immutable-document-rerender-on-structure.md)
3. [Items are raw text; formatting is rendered around it, not into it](0003-items-are-raw-text.md)
4. [localStorage, one JSON document, undo by snapshots](0004-localstorage-and-snapshot-undo.md)
5. [A hand-written service worker, cache first](0005-hand-written-service-worker.md)
6. [The toolchain and the browsers live in the Playwright image](0006-toolchain-in-the-playwright-image.md)
7. [Import adds to the page instead of replacing the outline](0007-import-adds-instead-of-replacing.md)
8. [Selecting items is a mode without a caret](0008-selecting-items-is-a-mode-without-a-caret.md)
9. [Reuse rows between renders](0009-reuse-rows-between-renders.md) (supersedes part of 2)
10. [Version the service worker by content](0010-version-the-service-worker-by-content.md) (supersedes part of 5)
11. [Sync through a server; every client keeps a full copy](0011-sync-through-a-server-every-client-keeps-a-copy.md)
12. [Merge fields by hybrid clock, order by fractional position](0012-merge-fields-by-hybrid-clock-order-by-fractional-position.md)
13. [A dependency-free Node server with SQLite](0013-a-dependency-free-node-server-with-sqlite.md)
14. [A stateless CLI instead of an MCP server](0014-a-stateless-cli-instead-of-an-mcp-server.md)
15. [Remote changes reset undo history](0015-remote-changes-reset-undo-history.md)
16. [Touch: a large fold target and swipes on rows](0016-touch-gestures-on-rows.md)
17. [Properties in notes, and a column view with rollups](0017-properties-in-notes-and-a-column-view-with-rollups.md) (storage superseded by 32)
18. [Tabs are replicas that share stored state](0018-tabs-are-replicas-that-share-stored-state.md)
19. [A longer left swipe opens the item menu](0019-a-longer-left-swipe-opens-the-item-menu.md) (supersedes part of 16)
20. [Properties written `:key: value`, as in org mode](0020-properties-written-as-org-drawer-lines.md) (supersedes part of 17) (superseded by 32)
21. [Code blocks are ``` fenced lines in notes](0021-code-blocks-are-fenced-lines-in-notes.md)
22. [Computed columns: a formula in the column spec](0022-computed-columns-with-formulas.md)
23. [Capture templates live in the outline; shortcuts reach them by URL](0023-capture-templates-live-in-the-outline.md)
24. [References are org links by id; mirrors wait](0024-references-are-org-links-mirrors-wait.md)
25. [A new version offers a reload](0025-a-new-version-offers-a-reload.md)
26. [Completed items last is an order of display, new items on top a page property](0026-completed-last-is-a-display-order.md)
27. [Kinds are the leading words before a colon, shown as badges](0027-kinds-are-leading-words-shown-as-badges.md)
28. [Attachments are files on the sync server, named by their hash](0028-attachments-are-files-on-the-sync-server-by-hash.md)
29. [Private items are sealed whole at the sync boundary](0029-private-items-are-sealed-whole-at-the-sync-boundary.md)
30. [Plugins run sandboxed, once a trusted device approves their code](0030-plugins-run-sandboxed-once-a-trusted-device-approves-them.md) (hooks superseded by 38)
31. [A board shows an item's children as columns and theirs as cards](0031-a-board-shows-children-as-columns.md)
32. [Properties are a field of their own, synced one by one](0032-properties-are-a-field-of-their-own.md)
33. [One search for items and commands, and a prefix key for the rest](0033-one-search-for-items-and-commands-and-a-prefix-key.md)
34. [An item's own value may be a formula](0034-an-items-own-value-may-be-a-formula.md)
35. [The Alt-Shift letters are gone, and the prefix's wait ends](0035-alt-shift-letters-removed-and-the-prefix-wait-ends.md)
36. [Dates are ISO text, shown as chips](0036-dates-are-iso-text-shown-as-chips.md)
37. [A built-in agenda lists items by date](0037-a-built-in-agenda-lists-items-by-date.md)
38. [Plugins answer events made in this tab](0038-plugins-answer-events-made-in-this-tab.md) (supersedes part of 30)
39. [`outline watch` polls the sync endpoint](0039-outline-watch-polls-the-sync-endpoint.md)
40. [Shortcuts are set on an item in the outline](0040-shortcuts-are-set-on-an-item-in-the-outline.md)
41. [One check command, Playwright projects pick tests by tag, and flaky tests leave the gate](0041-one-check-command-and-projects-picking-tests-by-tag.md)
42. [The sync server is a NixOS service on the server](0042-the-sync-server-is-a-nixos-service-on-dev.md)
43. [A mirror is an item with a `mirror` property, shown read-only](0043-a-mirror-is-an-item-with-a-mirror-property.md)
