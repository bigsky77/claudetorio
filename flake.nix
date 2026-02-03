{
  description = "ClaudeTorio - AI Factorio Streaming Platform";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";

    # Pinned to last commit with Factorio 1.1.110 (before 2.0 upgrade)
    # Commit c9dc635ba271 has: factorio: 1.1.109 -> 1.1.110
    nixpkgs-factorio.url = "github:NixOS/nixpkgs/c9dc635ba271dbda429ed5e3e5612598e2c2f945";
  };

  outputs = { self, nixpkgs, nixpkgs-factorio }:
  let
    system = "x86_64-linux";

    # Standard pkgs (latest nixos-24.05)
    pkgs = import nixpkgs {
      inherit system;
      config.allowUnfree = true;
    };

    # Pkgs with Factorio 1.1.110
    pkgs-factorio = import nixpkgs-factorio {
      inherit system;
      config.allowUnfree = true;
    };

    # The Factorio 1.1.110 package
    factorio-headless = pkgs-factorio.factorio-headless;

    # Minimal boot config for CI builds (real deployments use hardware-configuration.nix)
    minimalBootConfig = { lib, modulesPath, ... }: {
      imports = [ (modulesPath + "/profiles/qemu-guest.nix") ];
      boot.loader.grub.device = lib.mkDefault "/dev/sda";
      fileSystems."/" = lib.mkDefault {
        device = "/dev/disk/by-label/nixos";
        fsType = "ext4";
      };
    };
  in {

    # ===========================================
    # Packages
    # ===========================================
    packages.${system} = {
      factorio-headless = factorio-headless;
      default = factorio-headless;
    };

    # ===========================================
    # NixOS Configurations
    # ===========================================
    nixosConfigurations = {

      # Production: Game Server (Factorio + Broker + DB)
      # For real deployment, replace minimalBootConfig with hardware-configuration.nix
      game-server = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          minimalBootConfig  # Replace with real hardware config for deployment
          ./machines/game-server/configuration.nix
          {
            # Pass the pinned Factorio package
            _module.args.factorio-pkg = factorio-headless;
          }
        ];
      };

      # Production: Stream Server (KasmVNC + Factorio client)
      stream-server = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          minimalBootConfig  # Replace with real hardware config for deployment
          ./machines/stream-server/configuration.nix
        ];
      };

      # Development VM
      dev-vm = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          ({ config, pkgs, lib, modulesPath, ... }: {
            imports = [
              (modulesPath + "/profiles/qemu-guest.nix")
              (modulesPath + "/virtualisation/qemu-vm.nix")
            ];

            system.stateVersion = "24.05";

            # VM settings
            virtualisation = {
              memorySize = 8192;  # 8GB
              cores = 4;
              diskSize = 20000;  # 20GB disk

              # Forward ports to host
              forwardPorts = [
                { from = "host"; host.port = 2222; guest.port = 22; }
                { from = "host"; host.port = 3000; guest.port = 3000; }
                { from = "host"; host.port = 8080; guest.port = 8080; }
                { from = "host"; host.port = 5432; guest.port = 5432; }
              ];

              # Share the monorepo with the VM
              sharedDirectories = {
                claudetorio = {
                  source = toString ./.;
                  target = "/mnt/claudetorio";
                };
              };
            };

            networking = {
              hostName = "claudetorio-dev";
              firewall = {
                enable = true;
                allowedTCPPorts = [ 22 3000 8080 5432 6379 27015 ];
                allowedUDPPorts = [ 34197 ];
              };
            };

            # Docker
            virtualisation.docker = {
              enable = true;
              autoPrune.enable = true;
            };

            # SSH
            services.openssh = {
              enable = true;
              settings.PermitRootLogin = "yes";
            };

            # Packages
            environment.systemPackages = with pkgs; [
              docker-compose
              git
              vim
              curl
              wget
              jq
              htop
              tmux
              nodejs_20
              python312
              python312Packages.pip
              ripgrep
              fd
              tree
              unzip
              mcrcon  # For RCON testing
            ];

            # User
            users.users.dev = {
              isNormalUser = true;
              extraGroups = [ "docker" "wheel" ];
              initialPassword = "dev";
              home = "/home/dev";
            };

            # Root password for emergency
            users.users.root.initialPassword = "root";

            security.sudo.wheelNeedsPassword = false;

            # Auto-login
            services.getty.autologinUser = "dev";

            # Create symlink to shared folder
            system.activationScripts.claudetorio-link = lib.stringAfter [ "users" ] ''
              mkdir -p /home/dev
              ln -sfn /mnt/claudetorio /home/dev/claudetorio
              chown dev:users /home/dev/claudetorio 2>/dev/null || true
            '';

            # Allow unfree (for Factorio)
            nixpkgs.config.allowUnfree = true;

            # Welcome message
            environment.etc."motd".text = ''

              ========================================
              ClaudeTorio Development VM
              ========================================

              Shared folder: /mnt/claudetorio (or ~/claudetorio)

              Quick start:
                cd ~/claudetorio/dev
                docker compose up --build

              Ports forwarded to host:
                SSH:      localhost:2222
                Frontend: localhost:3000
                Broker:   localhost:8080

              User: dev / Password: dev
              ========================================

            '';
          })
        ];
      };
    };

    # ===========================================
    # Checks (NixOS VM Tests)
    # ===========================================
    checks.${system} = {
      # Unit test: Factorio server starts and RCON works
      factorio-server = import ./tests/factorio-server.nix {
        inherit pkgs;
        factorio-headless = factorio-headless;
      };

      # Integration test: Full stack multi-VM
      integration = import ./tests/integration.nix {
        inherit pkgs;
        factorio-headless = factorio-headless;
      };
    };

    # ===========================================
    # Development Shell
    # ===========================================
    devShells.${system}.default = pkgs.mkShell {
      buildInputs = with pkgs; [
        # Nix tools
        nixpkgs-fmt
        nil  # Nix LSP

        # Testing
        mcrcon

        # General dev
        git
        jq
      ];

      shellHook = ''
        echo "ClaudeTorio Infrastructure Dev Shell"
        echo ""
        echo "Commands:"
        echo "  nix flake check              - Run all checks"
        echo "  nix build .#factorio-headless - Build Factorio 1.1.110"
        echo "  nix run .#factorio-headless -- --version"
        echo ""
        echo "VM Tests:"
        echo "  nix build .#checks.x86_64-linux.factorio-server -L"
        echo "  nix build .#checks.x86_64-linux.integration -L"
        echo ""
        echo "Interactive debugging:"
        echo "  nix build .#checks.x86_64-linux.factorio-server.driverInteractive"
        echo "  ./result/bin/nixos-test-driver"
        echo ""
      '';
    };

  };
}
