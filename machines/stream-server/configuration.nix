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
      3002  # Stream frontend
      3003  # WebRTC signaling
      # Future TURN ports
      # 3478
    ];
    # Future TURN relay ports
    # allowedUDPPorts = lib.range 49152 49200;
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
