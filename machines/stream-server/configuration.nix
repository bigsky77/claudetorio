{ config, pkgs, lib, ... }:

{
  # Basic system
  system.stateVersion = "24.05";

  # Networking
  networking.hostName = "factorio-stream-server";
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [
      22    # SSH
      80    # HTTP (Caddy)
      443   # HTTPS (Caddy TLS)
      8090  # stream-agent API (broker → stream-agent)
      # Live stream slots 0-19 (KasmVNC viewers)
      3003 3004 3005 3006 3007 3008 3009 3010 3011 3012
      3013 3014 3015 3016 3017 3018 3019 3020 3021 3022
      # Replay stream slots 0-4
      4002 4003 4004 4005 4006
    ];
  };

  # Docker for KasmVNC and Factorio client
  virtualisation.docker.enable = true;
  virtualisation.oci-containers.backend = "docker";

  # Stream client containers
  virtualisation.oci-containers.containers = {
    # KasmVNC with Factorio client
    # stream-client = {
    #   image = "ghcr.io/claudetorio/stream-client:latest";
    #   ports = [ "3002:3002" ];
    #   environment = {
    #     FACTORIO_SERVER = "game-server:34197";
    #     VNC_RESOLUTION = "1920x1080";
    #   };
    # };
  };

  # Required packages
  environment.systemPackages = with pkgs; [
    docker-compose
    git
    htop
    curl
    vim
  ];

  # SSH
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "prohibit-password";
    };
  };

  # TODO: GPU drivers for better streaming performance
  # hardware.graphics.enable = true;  # Renamed from hardware.opengl in newer NixOS
  # services.xserver.videoDrivers = [ "nvidia" ];

  # TODO: Add when implementing stream module:
  # - KasmVNC configuration
  # - Factorio client configuration
  # - TURN server (coturn)
  # - WebRTC signaling server
}
