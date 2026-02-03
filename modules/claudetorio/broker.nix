{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.services.claudetorio.broker;
in
{
  options.services.claudetorio.broker = {
    enable = mkEnableOption "ClaudeTorio Broker API service";

    port = mkOption {
      type = types.port;
      default = 8080;
      description = "Port for the broker API.";
    };

    host = mkOption {
      type = types.str;
      default = "0.0.0.0";
      description = "Host to bind the broker API.";
    };

    databaseUrl = mkOption {
      type = types.str;
      default = "postgresql://claudetorio:claudetorio@localhost:5432/claudetorio";
      description = "PostgreSQL connection URL.";
    };

    redisUrl = mkOption {
      type = types.str;
      default = "redis://localhost:6379";
      description = "Redis connection URL.";
    };

    factorioRconHost = mkOption {
      type = types.str;
      default = "localhost";
      description = "Hostname for Factorio RCON connection.";
    };

    factorioRconPort = mkOption {
      type = types.port;
      default = 27015;
      description = "Port for Factorio RCON connection.";
    };

    factorioRconPassword = mkOption {
      type = types.str;
      description = "Password for Factorio RCON.";
    };

    # Container-based deployment (current approach)
    useContainer = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to run broker as a container (vs native service).";
    };

    containerImage = mkOption {
      type = types.str;
      default = "claudetorio-broker:latest";
      description = "Docker image for the broker.";
    };

    extraEnv = mkOption {
      type = types.attrsOf types.str;
      default = {};
      description = "Additional environment variables.";
    };
  };

  config = mkIf cfg.enable {
    # Common dependencies
    services.postgresql = {
      enable = true;
      ensureDatabases = [ "claudetorio" ];
      ensureUsers = [
        {
          name = "claudetorio";
          ensureDBOwnership = true;
        }
      ];
      # Allow local connections with password
      authentication = mkOverride 10 ''
        local all all trust
        host all all 127.0.0.1/32 trust
        host all all ::1/128 trust
      '';
    };

    services.redis.servers.default = {
      enable = true;
      port = 6379;
    };

    # Container-based deployment
    virtualisation.oci-containers.containers = mkIf cfg.useContainer {
      broker = {
        image = cfg.containerImage;
        ports = [ "${toString cfg.port}:${toString cfg.port}" ];
        environment = {
          HOST = cfg.host;
          PORT = toString cfg.port;
          DATABASE_URL = cfg.databaseUrl;
          REDIS_URL = cfg.redisUrl;
          FACTORIO_RCON_HOST = cfg.factorioRconHost;
          FACTORIO_RCON_PORT = toString cfg.factorioRconPort;
          FACTORIO_RCON_PASSWORD = cfg.factorioRconPassword;
        } // cfg.extraEnv;
        extraOptions = [
          "--network=host"  # For local postgres/redis access
        ];
        dependsOn = [];
      };
    };

    # Firewall
    networking.firewall.allowedTCPPorts = [ cfg.port ];
  };
}
