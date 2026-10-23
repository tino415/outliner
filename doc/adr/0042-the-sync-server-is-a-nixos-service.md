# 42. The sync server is a NixOS service

- **Status:** accepted, 2026-10-20
- **Applies to:** `nix/module.nix`, `flake.nix`, `compose.yaml`, `server/main.ts`, the installed CLI
- **Decides:** how the live sync server is installed, 2026-10-19 and 2026-10-20

## Context

ADR 13 put the server in the Compose stack, next to the toolchain. The
stack is for development: `compose up` rebuilds it, a stray `compose down`
stops every phone and Mac from syncing, and the database lives on a
volume only podman knows about. The flake already had a package that runs
the server.

## Decision

**The server runs as the systemd service `outline-sync`**, from the
module `nix/module.nix` (`services.outline-sync`): a dynamic user, the
database in `/var/lib/outline-sync`, the token read from an
`environmentFile` that only root can read, listening on 127.0.0.1:8791 as
the container did, so a proxy in front of it stays as it is.

**The machine fetches this repository over https at a pinned commit**:
its NixOS configuration names a `rev` and imports `nix/module.nix` from
it. The repository is public for that. A server version is installed only
when that `rev` moves and the machine is rebuilt, so merging here never
changes the live server.

**Branches with module changes are merged with a merge commit**, so the
pinned commit stays reachable from `main`.

**`compose.yaml` has no `sync` service, and the `app` container no
longer holds the token.** The CLI is no longer run in it: the `outline`
package is installed from this repository at the same pinned commit as
the server, with `~/.config/outline/config` naming
`http://127.0.0.1:8791` and the token. `bin/outline` is gone. From a
container the host's loopback is not reachable, and the CLI belongs on
loopback.

**The server closes open connections on SIGTERM**, so `systemctl stop`
returns at once instead of waiting out its stop timeout for a client that
holds a connection.

## Options considered

**Keeping the container and starting it from a systemd unit.** The
database would stay on a podman volume and a rebuild would still need the
toolchain's build output.

**Fetching the repository over ssh, or copying the module into the
machine's configuration.** A deploy key for root, or two copies of the
module that drift; a public repository needs neither.

**The CLI in the `app` container through the server's network address**,
as phones and Macs reach it. It works, but routes through the network for
a server on the same machine.

**Letting the server listen where containers can reach it** (the address
podman gives `host.containers.internal`). It would listen on the
machine's network address, guarded only by the token and the firewall.

## Consequences

- A CLI change reaches the installed `outline` when the pinned commit
  moves and the package is rebuilt, as a server change does.
- The token is in two places on the machine besides root's copy for the
  service: `.env.sync` in the checkout and the CLI's config.
- Deploying a server change is a change to the machine's configuration
  and a `nixos-rebuild switch` by root, not a container rebuild.
- The old container and its volume stay, stopped, until the service has
  run for a while; starting it again is the way back.
