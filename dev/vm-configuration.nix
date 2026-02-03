{ config, pkgs, lib, ... }:

{
  system.stateVersion = "24.05";

  # Boot configuration for VM
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Basic filesystem (VM will use tmpfs by default)
  fileSystems."/" = {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
  };

  networking = {
    hostName = "claudetorio-dev";
    # Enable networking in VM
    useDHCP = true;
    firewall = {
      enable = true;
      allowedTCPPorts = [ 22 3000 8080 5432 6379 ];
      allowedUDPPorts = [ 34197 ];
    };
  };

  # Enable Docker
  virtualisation.docker = {
    enable = true;
    # Enable docker-compose v2
    package = pkgs.docker;
  };

  # SSH for convenience
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = "yes";
  };

  # Dev tools
  environment.systemPackages = with pkgs; [
    # Docker
    docker-compose

    # Development
    git
    vim
    neovim
    curl
    wget
    jq
    htop
    tmux

    # Languages
    nodejs_20
    python312
    python312Packages.pip

    # Utilities
    ripgrep
    fd
    tree
    unzip
  ];

  # User configuration
  users.users.dev = {
    isNormalUser = true;
    extraGroups = [ "docker" "wheel" "networkmanager" ];
    initialPassword = "dev";
    shell = pkgs.bash;
  };

  # Allow passwordless sudo for dev user
  security.sudo.wheelNeedsPassword = false;

  # Auto-login for dev convenience
  services.getty.autologinUser = "dev";

  # Set up a nice shell environment
  programs.bash.enableCompletion = true;

  # Environment variables
  environment.variables = {
    EDITOR = "vim";
  };
}
