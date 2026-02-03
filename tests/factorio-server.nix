# Factorio Server Unit Test
#
# Tests that the Factorio server starts correctly and responds to RCON commands.
#
# Usage:
#   nix build .#checks.x86_64-linux.factorio-server -L
#   nix build .#checks.x86_64-linux.factorio-server.driverInteractive  # For debugging

{ pkgs, factorio-headless }:

# Use nixosTest directly which handles pkgs properly
(pkgs.nixosTest {
  name = "factorio-server";

  nodes.server = { config, lib, ... }: {
    imports = [ ../modules/claudetorio/factorio-server.nix ];

    # Use the pinned Factorio 1.1.110 package
    services.claudetorio.factorio = {
      enable = true;
      package = factorio-headless;
      rconPassword = "test-rcon-password";
      serverName = "Test Server";
      saveName = "test-save";
    };

    # VM-specific settings for faster testing
    virtualisation = {
      memorySize = 2048;
      cores = 2;
    };
  };

  testScript = ''
    import time

    start_all()

    with subtest("Factorio service starts"):
        server.wait_for_unit("factorio.service", timeout=120)

    with subtest("Factorio data directory exists"):
        server.succeed("test -d /var/lib/factorio")
        server.succeed("test -d /var/lib/factorio/saves")
        server.succeed("test -d /var/lib/factorio/config")

    with subtest("Save file is created"):
        # Give it time to create the save
        time.sleep(5)
        server.succeed("test -f /var/lib/factorio/saves/test-save.zip")

    with subtest("Game port is open"):
        server.wait_for_open_port(34197, timeout=60)

    with subtest("RCON port is open"):
        server.wait_for_open_port(27015, timeout=60)

    with subtest("RCON responds to commands"):
        # Use mcrcon to test RCON connectivity
        # The /version command should return the Factorio version
        result = server.succeed(
            "${pkgs.mcrcon}/bin/mcrcon -H localhost -P 27015 -p test-rcon-password '/version'"
        )
        print(f"RCON response: {result}")
        # Check that we got a version response (should contain "1.1.110" or similar)
        assert "1.1" in result or "Factorio" in result.lower(), f"Unexpected RCON response: {result}"

    with subtest("RCON can execute Lua commands"):
        # Test a simple Lua command
        result = server.succeed(
            "${pkgs.mcrcon}/bin/mcrcon -H localhost -P 27015 -p test-rcon-password '/c game.print(\"hello\")'"
        )
        print(f"Lua command response: {result}")

    with subtest("Service restarts on failure"):
        # Get the main PID
        pid = server.succeed("systemctl show factorio.service -p MainPID --value").strip()
        print(f"Factorio PID: {pid}")

        # Kill the process
        server.succeed(f"kill -9 {pid}")

        # Wait for systemd to restart it
        time.sleep(15)
        server.wait_for_unit("factorio.service", timeout=60)
        server.wait_for_open_port(27015, timeout=60)

        # Verify new PID
        new_pid = server.succeed("systemctl show factorio.service -p MainPID --value").strip()
        print(f"New Factorio PID: {new_pid}")
        assert pid != new_pid, "Service did not restart with new PID"

    print("All Factorio server tests passed!")
  '';
})
