{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.services.claudetorio.factorio;

  # Server settings JSON
  serverSettingsFile = pkgs.writeText "server-settings.json" (builtins.toJSON (
    {
      name = cfg.serverName;
      description = cfg.description;
      visibility = {
        public = false;
        lan = true;
      };
      require_user_verification = false;
      max_players = 0;
      ignore_player_limit_for_returning_players = false;
      allow_commands = "admins-only";
      autosave_interval = 10;
      autosave_slots = 5;
      afk_autokick_interval = 0;
      auto_pause = true;
      only_admins_can_pause_the_game = true;
      autosave_only_on_server = true;
    } // cfg.serverSettings
  ));

  # RCON password file
  rconPasswordFile = pkgs.writeText "rconpw" cfg.rconPassword;

  # Map gen settings (optional)
  mapGenSettingsFile = if cfg.mapGenSettings != null
    then pkgs.writeText "map-gen-settings.json" (builtins.toJSON cfg.mapGenSettings)
    else null;

  # Map settings (optional)
  mapSettingsFile = if cfg.mapSettings != null
    then pkgs.writeText "map-settings.json" (builtins.toJSON cfg.mapSettings)
    else null;
in
{
  options.services.claudetorio.factorio = {
    enable = mkEnableOption "Factorio headless server for ClaudeTorio";

    package = mkOption {
      type = types.package;
      default = pkgs.factorio-headless;
      defaultText = literalExpression "pkgs.factorio-headless";
      description = "The Factorio headless server package to use.";
    };

    port = mkOption {
      type = types.port;
      default = 34197;
      description = "UDP port for game connections.";
    };

    rconPort = mkOption {
      type = types.port;
      default = 27015;
      description = "TCP port for RCON connections.";
    };

    rconPassword = mkOption {
      type = types.str;
      description = "Password for RCON access. Use secrets management in production.";
      example = "secure-rcon-password";
    };

    serverName = mkOption {
      type = types.str;
      default = "ClaudeTorio Server";
      description = "Name shown in server browser.";
    };

    description = mkOption {
      type = types.str;
      default = "AI-powered Factorio server";
      description = "Server description.";
    };

    saveName = mkOption {
      type = types.str;
      default = "claudetorio";
      description = "Name of the save file (without extension).";
    };

    dataDir = mkOption {
      type = types.path;
      default = "/var/lib/factorio";
      description = "Directory for Factorio data (saves, mods, etc).";
    };

    serverSettings = mkOption {
      type = types.attrs;
      default = {};
      description = "Additional server settings to merge with defaults.";
    };

    mapGenSettings = mkOption {
      type = types.nullOr types.attrs;
      default = null;
      description = "Map generation settings. If null, uses Factorio defaults.";
    };

    mapSettings = mkOption {
      type = types.nullOr types.attrs;
      default = null;
      description = "Map settings (pollution, evolution, etc). If null, uses Factorio defaults.";
    };

    mods = mkOption {
      type = types.listOf types.package;
      default = [];
      description = "List of mod packages to install.";
    };

    extraArgs = mkOption {
      type = types.listOf types.str;
      default = [];
      description = "Extra command-line arguments for the server.";
    };
  };

  config = mkIf cfg.enable {
    # Create factorio user and group
    users.users.factorio = {
      isSystemUser = true;
      group = "factorio";
      home = cfg.dataDir;
      createHome = true;
      description = "Factorio server user";
    };
    users.groups.factorio = {};

    # Ensure data directory structure exists
    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0750 factorio factorio -"
      "d ${cfg.dataDir}/saves 0750 factorio factorio -"
      "d ${cfg.dataDir}/mods 0750 factorio factorio -"
      "d ${cfg.dataDir}/config 0750 factorio factorio -"
      "d ${cfg.dataDir}/script-output 0750 factorio factorio -"
    ];

    # Main Factorio service
    systemd.services.factorio = {
      description = "Factorio Headless Server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      preStart = ''
        # Copy server settings
        cp ${serverSettingsFile} ${cfg.dataDir}/config/server-settings.json
        chmod 640 ${cfg.dataDir}/config/server-settings.json

        # Copy RCON password
        cp ${rconPasswordFile} ${cfg.dataDir}/config/rconpw
        chmod 600 ${cfg.dataDir}/config/rconpw

        ${optionalString (mapGenSettingsFile != null) ''
          cp ${mapGenSettingsFile} ${cfg.dataDir}/config/map-gen-settings.json
          chmod 640 ${cfg.dataDir}/config/map-gen-settings.json
        ''}

        ${optionalString (mapSettingsFile != null) ''
          cp ${mapSettingsFile} ${cfg.dataDir}/config/map-settings.json
          chmod 640 ${cfg.dataDir}/config/map-settings.json
        ''}

        # Create initial save if none exists
        if [ ! -f "${cfg.dataDir}/saves/${cfg.saveName}.zip" ]; then
          echo "Creating new save: ${cfg.saveName}"
          ${cfg.package}/bin/factorio \
            --create "${cfg.dataDir}/saves/${cfg.saveName}.zip" \
            ${optionalString (mapGenSettingsFile != null) "--map-gen-settings ${cfg.dataDir}/config/map-gen-settings.json"} \
            ${optionalString (mapSettingsFile != null) "--map-settings ${cfg.dataDir}/config/map-settings.json"}
        fi
      '';

      serviceConfig = {
        Type = "simple";
        User = "factorio";
        Group = "factorio";
        WorkingDirectory = cfg.dataDir;

        ExecStart = concatStringsSep " " ([
          "${cfg.package}/bin/factorio"
          "--start-server ${cfg.dataDir}/saves/${cfg.saveName}.zip"
          "--port ${toString cfg.port}"
          "--rcon-port ${toString cfg.rconPort}"
          "--rcon-password $(cat ${cfg.dataDir}/config/rconpw)"
          "--server-settings ${cfg.dataDir}/config/server-settings.json"
        ] ++ cfg.extraArgs);

        Restart = "always";
        RestartSec = 10;

        # Security hardening
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [ cfg.dataDir ];

        # Resource limits
        MemoryMax = "4G";
        TasksMax = 100;
      };
    };

    # Firewall rules
    networking.firewall = {
      allowedUDPPorts = [ cfg.port ];
      allowedTCPPorts = [ cfg.rconPort ];
    };
  };
}
