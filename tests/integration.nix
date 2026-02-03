# ClaudeTorio Integration Test
#
# Full stack test with game server, broker, database, and (simulated) stream server.
#
# Usage:
#   nix build .#checks.x86_64-linux.integration -L
#   nix build .#checks.x86_64-linux.integration.driverInteractive  # For debugging

{ pkgs, factorio-headless }:

# Use nixosTest directly which handles pkgs properly
(pkgs.nixosTest {
  name = "claudetorio-integration";

  nodes = {
    # Game server: Factorio + Broker + PostgreSQL + Redis
    gameserver = { config, lib, ... }: {
      imports = [
        ../modules/claudetorio/factorio-server.nix
        ../modules/claudetorio/broker.nix
      ];

      networking.hostName = "gameserver";

      # Factorio server
      services.claudetorio.factorio = {
        enable = true;
        package = factorio-headless;
        rconPassword = "integration-test-password";
        serverName = "Integration Test Server";
        saveName = "integration-test";
      };

      # Broker (disabled for now - just test infrastructure)
      # services.claudetorio.broker = {
      #   enable = true;
      #   factorioRconPassword = "integration-test-password";
      #   useContainer = false;  # No container in VM tests
      # };

      # Direct PostgreSQL and Redis for testing
      services.postgresql = {
        enable = true;
        ensureDatabases = [ "claudetorio" ];
        ensureUsers = [
          { name = "claudetorio"; ensureDBOwnership = true; }
        ];
      };

      services.redis.servers.default = {
        enable = true;
        port = 6379;
      };

      # Networking
      networking.firewall = {
        enable = true;
        allowedTCPPorts = [ 5432 6379 8080 27015 ];
        allowedUDPPorts = [ 34197 ];
      };

      # VM settings
      virtualisation = {
        memorySize = 4096;
        cores = 2;
      };
    };

    # Stream server (minimal for connectivity tests)
    streamserver = { config, lib, ... }: {
      networking.hostName = "streamserver";

      environment.systemPackages = with pkgs; [
        curl
        netcat
        mcrcon
      ];

      virtualisation = {
        memorySize = 512;
        cores = 1;
      };
    };
  };

  testScript = ''
    import time

    start_all()

    # ============================================
    # Game Server Tests
    # ============================================

    with subtest("PostgreSQL starts"):
        gameserver.wait_for_unit("postgresql.service", timeout=60)
        gameserver.wait_for_open_port(5432)

    with subtest("Redis starts"):
        gameserver.wait_for_unit("redis-default.service", timeout=60)
        gameserver.wait_for_open_port(6379)

    with subtest("Factorio server starts"):
        gameserver.wait_for_unit("factorio.service", timeout=120)
        gameserver.wait_for_open_port(34197)
        gameserver.wait_for_open_port(27015)

    with subtest("Database is accessible"):
        result = gameserver.succeed(
            "sudo -u postgres psql -d claudetorio -c 'SELECT 1;'"
        )
        assert "1" in result, f"Database query failed: {result}"

    with subtest("Redis is accessible"):
        result = gameserver.succeed("redis-cli ping")
        assert "PONG" in result, f"Redis ping failed: {result}"

    with subtest("RCON responds on game server"):
        result = gameserver.succeed(
            "${pkgs.mcrcon}/bin/mcrcon -H localhost -P 27015 -p integration-test-password '/version'"
        )
        print(f"RCON response: {result}")
        assert "1.1" in result or "Factorio" in result.lower()

    # ============================================
    # Cross-Machine Connectivity Tests
    # ============================================

    with subtest("Stream server can ping game server"):
        streamserver.succeed("ping -c 3 gameserver")

    with subtest("Stream server can reach Factorio UDP port"):
        # Use netcat to check UDP connectivity
        streamserver.succeed("nc -zu gameserver 34197")

    with subtest("Stream server can reach RCON TCP port"):
        streamserver.succeed("nc -z gameserver 27015")

    with subtest("Stream server can execute RCON commands"):
        result = streamserver.succeed(
            "${pkgs.mcrcon}/bin/mcrcon -H gameserver -P 27015 -p integration-test-password '/version'"
        )
        print(f"Remote RCON response: {result}")
        assert "1.1" in result or "Factorio" in result.lower()

    with subtest("Stream server can reach PostgreSQL"):
        streamserver.succeed("nc -z gameserver 5432")

    with subtest("Stream server can reach Redis"):
        streamserver.succeed("nc -z gameserver 6379")

    # ============================================
    # Stress Tests
    # ============================================

    with subtest("Multiple RCON commands in sequence"):
        for i in range(5):
            result = gameserver.succeed(
                f"${pkgs.mcrcon}/bin/mcrcon -H localhost -P 27015 -p integration-test-password '/c game.print(\"test {i}\")'"
            )
            print(f"Command {i}: {result}")

    with subtest("Factorio survives restart"):
        # Get current tick count
        gameserver.succeed(
            "${pkgs.mcrcon}/bin/mcrcon -H localhost -P 27015 -p integration-test-password '/c game.print(game.tick)'"
        )

        # Restart service
        gameserver.succeed("systemctl restart factorio.service")
        time.sleep(10)

        # Verify it comes back
        gameserver.wait_for_unit("factorio.service", timeout=60)
        gameserver.wait_for_open_port(27015, timeout=60)

        # Verify RCON still works
        result = gameserver.succeed(
            "${pkgs.mcrcon}/bin/mcrcon -H localhost -P 27015 -p integration-test-password '/version'"
        )
        assert "1.1" in result or "Factorio" in result.lower()

    print("All integration tests passed!")
  '';
})
