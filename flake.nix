{
  description = "outline, the command line for the outliner-lab outline, and its sync server";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs, ... }:
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
      nixosModules.default = ./nix/module.nix;

      packages = forEachSystem (pkgs: rec {
        outline = pkgs.callPackage ./nix/outline.nix { buildCommit = self.shortRev or self.dirtyShortRev or "dev"; };
        outline-sync-server = pkgs.lib.addMetaAttrs { mainProgram = "outline-sync-server"; } outline;
        default = outline;
      });
    };
}
