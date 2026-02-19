# ClaudeTorio Game Server Configuration
#
# This is the base configuration for the game server.
# For deployment, import this along with hardware-configuration.nix:
#
#   nixosConfigurations.game-server = nixpkgs.lib.nixosSystem {
#     modules = [
#       ./machines/game-server/configuration.nix
#       ./machines/game-server/hardware-configuration.nix
#     ];
#   };

{ config, pkgs, lib, factorio-pkg ? pkgs.factorio-headless, ... }:

{
  imports = [
    ../../modules/claudetorio/factorio-server.nix
    ../../modules/claudetorio/broker.nix
  ];

  # Basic system
  system.stateVersion = "24.05";

  # Networking
  networking.hostName = "factorio-server";
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [
      22    # SSH
      80    # HTTP
      443   # HTTPS
      3000  # Frontend
      8080  # Broker API
      27015 # RCON (opened by factorio module, but explicit here)
      # Replay RCON ports — stream-worker (on game-server) connects to factorio-replay via host
      28000 28001 28002 28003 28004
    ];
    # UDP ports for live Factorio slots (stream-clients on stream-server connect here)
    allowedUDPPorts =
      lib.range 34197 34216 ++   # live Factorio slots 0-19
      lib.range 35100 35104;     # replay Factorio slots 0-4
  };

  # ClaudeTorio Factorio server
  services.claudetorio.factorio = {
    enable = true;
    package = factorio-pkg;
    rconPassword = "CHANGEME-use-secrets-management";  # TODO: Use sops-nix or agenix
    serverName = "ClaudeTorio Production";
    description = "AI-powered Factorio server - https://claudetorio.dev";
    saveName = "production";
  };

  # ClaudeTorio Broker (container-based for now)
  # TODO: Migrate to native service once stable
  services.claudetorio.broker = {
    enable = true;
    factorioRconPassword = config.services.claudetorio.factorio.rconPassword;
    useContainer = true;
    containerImage = "ghcr.io/claudetorio/broker:latest";
  };

  # Docker for containers
  virtualisation.docker.enable = true;
  virtualisation.oci-containers.backend = "docker";

  # Required packages
  environment.systemPackages = with pkgs; [
    docker-compose
    git
    htop
    curl
    jq
    mcrcon  # For RCON debugging
    vim
    tmux
  ];

  # SSH
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "prohibit-password";
    };
  };

  # Allow unfree (Factorio)
  nixpkgs.config.allowUnfree = true;

  # TODO: Add when migrating to NixOS:
  # - SSL certificates (services.nginx + ACME)
  # - Users and SSH keys
  # - Monitoring (Prometheus + Grafana)
  # - Backups (restic)
  # - Secrets management (sops-nix or agenix)
}
