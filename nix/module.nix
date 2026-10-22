{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.outline-sync;
in
{
  options.services.outline-sync = {
    enable = lib.mkEnableOption "the outline sync server";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./outline.nix { inherit (cfg) buildCommit; };
    };

    buildCommit = lib.mkOption {
      type = lib.types.str;
      default = "nix";
      description = "Shown at the bottom of the app's ⋯ menu.";
    };

    serveApp = lib.mkEnableOption "serving the app (the PWA) from the same address as sync";

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8791;
    };

    origins = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "*" ];
    };

    environmentFile = lib.mkOption {
      type = lib.types.path;
      description = "File with the line OUTLINE_TOKEN=<secret of at least 16 characters>.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.outline-sync = {
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment = {
        OUTLINE_DB = "/var/lib/outline-sync/outline.db";
        HOST = cfg.host;
        PORT = toString cfg.port;
        OUTLINE_ORIGINS = lib.concatStringsSep "," cfg.origins;
        OUTLINE_APP_DIR = lib.optionalString cfg.serveApp "${cfg.package}/share/outline/app";
      };
      serviceConfig = {
        ExecStart = "${cfg.package}/bin/outline-sync-server";
        EnvironmentFile = cfg.environmentFile;
        DynamicUser = true;
        StateDirectory = "outline-sync";
        Restart = "on-failure";
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        NoNewPrivileges = true;
      };
    };
  };
}
