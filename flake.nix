{
  description = "outline, the command line for the outliner-lab outline, and its sync server";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forEachSystem (pkgs: rec {
        outline = pkgs.callPackage ./nix/outline.nix { };
        outline-sync-server = pkgs.lib.addMetaAttrs { mainProgram = "outline-sync-server"; } outline;
        default = outline;
      });
    };
}
