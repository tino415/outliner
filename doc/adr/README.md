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
