# 42. The sync server is a NixOS service on dev

- **Status:** accepted, 2026-10-20
- **Applies to:** `nix/module.nix`, `flake.nix`, `compose.yaml`, `server/main.ts`
- **Decides:** step 2 of the card "Package the sync server with Nix" (Projects/Outliner), with Martin's choices of 2026-10-19

## Context

ADR 13 put the server in the Compose stack, next to the toolchain. The
stack is for development: `compose up` rebuilds it, a stray `compose down`
stops Martin's phone and Mac from syncing, and the database lives on a
volume only podman knows about. Step 1 of the card gave the flake a
package that runs the server.

## Decision

**dev runs the server as the systemd service `outline-sync`**, from the
module `nix/module.nix` (`services.outline-sync`): a dynamic user, the
database in `/var/lib/outline-sync`, the token read from an
`environmentFile` that only root can read, listening on 127.0.0.1:8791 as
the container did, so the tailnet route and the local proxy stay as they
are.

**The machine fetches this repository over https at a pinned commit**:
`configuration.nix` in tino415/system names a `rev` and imports
`nix/module.nix` from it. The repository is public for that. A server
version reaches dev only when that `rev` moves and the machine is rebuilt,
so merging here never changes the live server.

**Branches with module changes are merged with a merge commit**, so the
pinned commit stays reachable from `main`.

**`compose.yaml` has no `sync` service.** The `app` container reaches the
server through the tailnet address, `https://dev.taile622dc.ts.net:10001`,
as the phone and the Mac do: from a container the host's loopback is not
reachable.

**The server closes open connections on SIGTERM**, so `systemctl stop`
returns at once instead of waiting out its stop timeout for a client that
holds a connection.

## Options considered

**Keeping the container and starting it from a systemd unit.** The
database would stay on a podman volume and a rebuild would still need the
toolchain's build output.

**Fetching the repository over ssh, or copying the module into
tino415/system.** A deploy key for root, or two copies of the module that
drift; Martin chose a public repository.

**Letting the server listen where containers can reach it** (the address
podman gives `host.containers.internal`). It would listen on the
machine's network address, guarded only by the token and the firewall.

## Consequences

- `bin/outline` works only while the tailnet route is up.
- Deploying a server change is a change to tino415/system and a
  `nixos-rebuild switch` by root, not a container rebuild.
- The old container and its volume stay, stopped, until the service has
  run for a while; starting it again is the way back.
