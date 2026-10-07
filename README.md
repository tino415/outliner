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

## Publishing

```sh
dev-run env BUILD_COMMIT=<short sha> npm run build
cp -r dist/. ~/srv/pub/outliner-lab/
```

The build uses relative paths, so it works under any sub-path.
