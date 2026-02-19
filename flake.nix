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
      # Game Server VM — mirrors production game-server role
      # Runs: broker, postgres, redis, frontend, run-worker, stream-worker
      # Port map (host → guest):
      #   SSH :2222, Broker :8080, Frontend :3000
      #   Factorio UDP :34197-34201 (live slots 0-4)
      #   Factorio UDP :35100-35102 (replay slots 0-2)
      game-server-vm = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          ({ config, pkgs, lib, modulesPath, ... }: {
            imports = [
              (modulesPath + "/profiles/qemu-guest.nix")
              (modulesPath + "/virtualisation/qemu-vm.nix")
            ];

            system.stateVersion = "24.05";

            virtualisation = {
              memorySize = 8192;
              cores = 4;
              diskSize = 40000;
              graphics = false;

              forwardPorts = [
                { from = "host"; host.port = 2222; guest.port = 22; }
                { from = "host"; host.port = 8080; guest.port = 8080; }
                { from = "host"; host.port = 3000; guest.port = 3000; }
                # Live Factorio UDP slots 0-4
                { from = "host"; host.port = 34197; guest.port = 34197; proto = "udp"; }
                { from = "host"; host.port = 34198; guest.port = 34198; proto = "udp"; }
                { from = "host"; host.port = 34199; guest.port = 34199; proto = "udp"; }
                { from = "host"; host.port = 34200; guest.port = 34200; proto = "udp"; }
                { from = "host"; host.port = 34201; guest.port = 34201; proto = "udp"; }
                # Replay Factorio UDP slots 0-2
                { from = "host"; host.port = 35100; guest.port = 35100; proto = "udp"; }
                { from = "host"; host.port = 35101; guest.port = 35101; proto = "udp"; }
                { from = "host"; host.port = 35102; guest.port = 35102; proto = "udp"; }
              ];

              sharedDirectories.claudetorio = {
                source = toString ./.;
                target = "/mnt/claudetorio";
              };

              docker = {
                enable = true;
                autoPrune.enable = true;
              };
            };

            networking = {
              hostName = "claudetorio-game";
              firewall.enable = false;
            };

            services.openssh = {
              enable = true;
              settings.PermitRootLogin = "yes";
            };

            environment.systemPackages = with pkgs; [
              docker-compose git curl jq mcrcon vim htop tmux
            ];

            users.users.dev = {
              isNormalUser = true;
              extraGroups = [ "docker" "wheel" ];
              initialPassword = "dev";
              home = "/home/dev";
            };

            users.users.root.initialPassword = "root";
            security.sudo.wheelNeedsPassword = false;
            services.getty.autologinUser = "dev";
            nixpkgs.config.allowUnfree = true;

            systemd.services.claudetorio-deploy = {
              description = "ClaudeTorio game-server initial deploy";
              after = [ "docker.service" "network.target" ];
              wantedBy = [ "multi-user.target" ];
              serviceConfig = {
                Type = "oneshot";
                RemainAfterExit = true;
              };
              path = with pkgs; [ docker docker-compose bash coreutils ];
              script = ''
                set -euo pipefail
                export PATH=/run/current-system/sw/bin:$PATH

                mkdir -p /etc/claudetorio
                {
                  echo "POSTGRES_PASSWORD=dev_password"
                  echo "RCON_PASSWORD=dev_rcon_password"
                  echo "FACTORIO_IMAGE=factoriotools/factorio:1.1.110"
                  echo "STREAM_AGENT_KEY=dev_stream_agent_key"
                  echo "STREAM_AGENT_URL=http://10.0.2.2:8090"
                  echo "GAME_SERVER_PUBLIC_HOST=10.0.2.2"
                  echo "STREAM_SERVER_PUBLIC_HOST=10.0.2.2"
                  echo "STREAM_URL=http://10.0.2.2"
                  echo "STREAM_PUBLIC_HOST=10.0.2.2"
                  echo "NEXT_PUBLIC_API_URL=http://localhost:8080"
                  echo "NEXT_PUBLIC_STREAM_URL=http://localhost:3003"
                } > /etc/claudetorio/game-server.env

                cd /mnt/claudetorio/machines/game-server
                E="--env-file /etc/claudetorio/game-server.env"

                docker compose $E run --rm factorio-config-init
                docker compose $E run --rm factorio-scenarios-init
                docker run --rm -v claudetorio_factorio_config:/v alpine sh -c "test -f /v/server-settings.json"
                docker compose $E --profile build-only build run-worker stream-worker
                docker compose $E up --build -d --force-recreate
              '';
            };

            environment.etc."motd".text = ''

              ========================================
              ClaudeTorio Game Server VM
              ========================================

              Shared folder: /mnt/claudetorio

              Ports forwarded to host:
                SSH:      localhost:2222
                Broker:   localhost:8080
                Frontend: localhost:3000

              Cross-VM: 10.0.2.2 = host (stream-server-vm at host:8090)

              User: dev / Password: dev
              ========================================

            '';
          })
        ];
      };

      # Stream Server VM — mirrors production stream-server role
      # Runs: stream-agent, caddy, stream-client (spawned dynamically)
      # Port map (host → guest):
      #   SSH :2223, stream-agent :8090
      #   Live streams :3003-3007 (slots 0-4)
      #   Replay streams :4002-4003 (slots 0-1)
      stream-server-vm = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          ({ config, pkgs, lib, modulesPath, ... }: {
            imports = [
              (modulesPath + "/profiles/qemu-guest.nix")
              (modulesPath + "/virtualisation/qemu-vm.nix")
            ];

            system.stateVersion = "24.05";

            virtualisation = {
              memorySize = 4096;
              cores = 2;
              diskSize = 20000;
              graphics = false;

              forwardPorts = [
                { from = "host"; host.port = 2223; guest.port = 22; }
                { from = "host"; host.port = 8090; guest.port = 8090; }
                # Live stream slots 0-4
                { from = "host"; host.port = 3003; guest.port = 3003; }
                { from = "host"; host.port = 3004; guest.port = 3004; }
                { from = "host"; host.port = 3005; guest.port = 3005; }
                { from = "host"; host.port = 3006; guest.port = 3006; }
                { from = "host"; host.port = 3007; guest.port = 3007; }
                # Replay stream slots 0-1
                { from = "host"; host.port = 4002; guest.port = 4002; }
                { from = "host"; host.port = 4003; guest.port = 4003; }
              ];

              sharedDirectories.claudetorio = {
                source = toString ./.;
                target = "/mnt/claudetorio";
              };

              docker = {
                enable = true;
                autoPrune.enable = true;
              };
            };

            networking = {
              hostName = "claudetorio-stream";
              firewall.enable = false;
            };

            services.openssh = {
              enable = true;
              settings.PermitRootLogin = "yes";
            };

            environment.systemPackages = with pkgs; [
              docker-compose git curl jq vim htop tmux
            ];

            users.users.dev = {
              isNormalUser = true;
              extraGroups = [ "docker" "wheel" ];
              initialPassword = "dev";
              home = "/home/dev";
            };

            users.users.root.initialPassword = "root";
            security.sudo.wheelNeedsPassword = false;
            services.getty.autologinUser = "dev";
            nixpkgs.config.allowUnfree = true;

            systemd.services.claudetorio-deploy = {
              description = "ClaudeTorio stream-server initial deploy";
              after = [ "docker.service" "network.target" ];
              wantedBy = [ "multi-user.target" ];
              serviceConfig = {
                Type = "oneshot";
                RemainAfterExit = true;
              };
              path = with pkgs; [ docker docker-compose bash coreutils ];
              script = ''
                set -euo pipefail
                export PATH=/run/current-system/sw/bin:$PATH

                mkdir -p /etc/claudetorio /opt/factorio
                {
                  echo "STREAM_DOMAIN=stream.localhost"
                  echo "STREAM_AGENT_KEY=dev_stream_agent_key"
                  echo "FACTORIO_CLIENT_PATH=/opt/factorio"
                } > /etc/claudetorio/stream-server.env

                cd /mnt/claudetorio/machines/stream-server
                E="--env-file /etc/claudetorio/stream-server.env"

                docker compose $E --profile build-only build stream-client stream-worker
                docker compose $E run --rm factorio-client-init || true
                docker compose $E up --build -d
              '';
            };

            environment.etc."motd".text = ''

              ========================================
              ClaudeTorio Stream Server VM
              ========================================

              Shared folder: /mnt/claudetorio

              Ports forwarded to host:
                SSH:          localhost:2223
                Stream-agent: localhost:8090
                Streams:      localhost:3003-3007

              Cross-VM: 10.0.2.2 = host (game-server-vm at host:8080)

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
