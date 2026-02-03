# ClaudeTorio NixOS Infrastructure Design

**Clean, Minimal, Scalable-Enough NixOS Configuration for 3-Tier Architecture**

This document describes the NixOS deployment strategy that matches the ClaudeTorio 3-tier architecture, following the principles: "think in containers", "think about interactions", "think about external access".

---

## 1. Server Roles and Container Boundaries

### 1.1 `factorio-server` (Big CPU Box)

**Role:** Tier 1 Simulation (cheap, many)

| Component | Type | Purpose |
|-----------|------|---------|
| N headless Factorio servers | Container (one per `gameId`/port) | Run AI games 24/7 |
| AI agent/FLE workers | Container (future) | Execute AI actions |
| Per-game sidecar | Container (future) | Registration/heartbeat |

**Network Rules:**

- **Do not expose RCON publicly**
- Prefer **private east–west traffic** (Factorio UDP + RCON) over mesh network (Tailscale/WireGuard)
- Only stream clients + ops machines can reach games

### 1.2 `factorio-server-mini` (Tiny Control-Plane Box)

**Role:** Broker + State (control plane)

| Component | Type | Purpose |
|-----------|------|---------|
| Broker API | Container (FastAPI) | Session management, allocation |
| Redis | Native NixOS service | State storage (minimal overhead) |

**External Access:**

- One HTTPS endpoint: `https://api.<domain>/` (via Caddy)

### 1.3 `factorio-server-stream` (Stream Tier)

**Role:** Tier 2 Rendering/Streaming + Tier 3 Access

| Component | Type | Purpose |
|-----------|------|---------|
| coturn | Native NixOS service | TURN relay (UDP-heavy, simplest native) |
| StreamClient pool | Containers (`c01`, `c02`, `c03`, …) | Selkies + Factorio GUI |
| Caddy | Native NixOS service | Reverse proxy, TLS termination |

**External Access (Public Internet):**

| Port | Protocol | Purpose |
|------|----------|---------|
| 443 | TCP | HTTPS |
| 3478 | UDP + TCP | TURN signaling |
| 49152-49200 | UDP | TURN relay range (start tight, widen later) |

**Internal Access:**

- StreamClients connect to Factorio servers over **private network**

---

## 2. Design Principles

### 2.1 "Clean and Minimal" Choices

| Principle | Implementation |
|-----------|----------------|
| **One flake repo** | Defines all machines in a single repository |
| **Role modules** | `game-server` / `broker` / `stream-host` modules prevent copy/paste |
| **Containers where helpful** | App + Selkies + Factorio versions easiest to pin as images |
| **Native services where simpler** | Redis/coturn/Caddy as NixOS services (fewer moving parts) |
| **Podman + `virtualisation.oci-containers`** | Nix generates systemd units per container; avoids docker-compose drift |

### 2.2 "Scalable Later" Without Overengineering

| Scaling Target | Method |
|----------------|--------|
| **More games** | Add entries to `claudetorio.factorio.games = [...]` or add CPU boxes |
| **More streaming** | Add entries to `claudetorio.stream.clients = [...]` or add stream hosts |
| **Future migration** | Nothing blocks migration to Compose/K8s—this is just a clean control layer |

---

## 3. External Access Plan

### 3.1 DNS Records

| Record | Target | Server |
|--------|--------|--------|
| `api.<domain>` | A/AAAA | `factorio-server-mini` public IP |
| `turn.<domain>` | A/AAAA (optional) | `factorio-server-stream` public IP |
| `c01.stream.<domain>` | A/AAAA | `factorio-server-stream` public IP |
| `c02.stream.<domain>` | A/AAAA | `factorio-server-stream` public IP |
| `cNN.stream.<domain>` | A/AAAA | `factorio-server-stream` public IP |

Caddy handles TLS automatically (Let's Encrypt) as long as:

- DNS records point to the right server
- Ports 80/443 are reachable

### 3.2 Firewall Philosophy

**Default deny.** Open only:

| Server | Ports | Notes |
|--------|-------|-------|
| All | 22/tcp | SSH (optionally restrict to your IPs) |
| `factorio-server-mini` | 80/443/tcp | Broker API |
| `factorio-server-stream` | 80/443/tcp | Stream endpoints |
| `factorio-server-stream` | 3478/udp+tcp | TURN signaling |
| `factorio-server-stream` | 49152-49200/udp | TURN relay range |
| `factorio-server` | Factorio UDP/RCON | **Private interface only** (Tailscale) |

---

## 4. Repository Structure

```
claudetorio-nix/
├── flake.nix
├── flake.lock
├── hosts/
│   ├── factorio-server.nix
│   ├── factorio-server-mini.nix
│   └── factorio-server-stream.nix
├── modules/
│   ├── base.nix
│   ├── roles/
│   │   ├── game-server.nix
│   │   ├── broker.nix
│   │   └── stream-host.nix
│   └── tailscale.nix (optional)
└── secrets/
    └── secrets.yaml (sops-encrypted)
```

---

## 5. Configuration Customization

### 5.1 Add Your SSH Key

Edit `modules/base.nix`:

```nix
users.users.deploy.openssh.authorizedKeys.keys = [
  "ssh-ed25519 AAAA_REPLACE_ME you@laptop"
];
```

### 5.2 Set Your Domain

Edit `hosts/factorio-server-mini.nix`:

```nix
claudetorio.broker.domain = "example.com";
```

Edit `hosts/factorio-server-stream.nix`:

```nix
claudetorio.stream.domain = "example.com";
```

### 5.3 Define Games and Stream Clients

**Games** (`hosts/factorio-server.nix`):

```nix
claudetorio.factorio.games = [
  { name = "g01"; udpPort = 34197; rconPort = 27015; }
  { name = "g02"; udpPort = 34198; rconPort = 27016; }
  { name = "g03"; udpPort = 34199; rconPort = 27017; }
  # Add more as needed...
];
```

**Stream Clients** (`hosts/factorio-server-stream.nix`):

```nix
claudetorio.stream.clients = [
  { id = "c01"; localPort = 9001; }
  { id = "c02"; localPort = 9002; }
  { id = "c03"; localPort = 9003; }
  # Add more as needed...
];
```

### 5.4 Pin Container Images

In each role module, you'll see defaults like:

```nix
factorioImage = "ghcr.io/your-org/factorio-headless:1.1.110";
```

**For reproducibility, pin by digest:**

```nix
image = "ghcr.io/your-org/factorio-headless@sha256:abc123...";
```

This prevents "it worked yesterday" problems.

---

## 6. Secrets Management

### 6.1 Using sops-nix (Recommended)

The skeleton uses **sops-nix** so secrets don't land in the Nix store.

**Expected secret keys** (in `secrets/secrets.yaml`):

| Key | Purpose |
|-----|---------|
| `turn_static_auth_secret` | coturn TURN REST secret |
| `broker_env` | Env file for Broker container (JWT secret, etc.) |
| `selkies_env` | TURN config env for StreamClients |
| `tailscale_authkey` | Optional auto-join key |

### 6.2 Manual Fallback (Without sops)

If you don't want sops yet:

1. Create files manually:
   - `/etc/claudetorio/broker.env`
   - `/etc/claudetorio/selkies.env`

2. Point container configs to them:
   ```nix
   environmentFiles = [ "/etc/claudetorio/broker.env" ];
   ```

3. Later swap to sops-nix when ready

---

## 7. Deployment Workflow

### 7.1 Initial Setup

1. Install NixOS on each box
2. Clone the flake repo
3. Customize configuration (SSH keys, domain, games, clients)
4. Set up secrets (sops or manual)

### 7.2 Deploy Commands

```bash
# Deploy to game server
nixos-rebuild switch \
  --flake .#factorio-server \
  --target-host deploy@<game-server-ip> \
  --use-remote-sudo

# Deploy to broker
nixos-rebuild switch \
  --flake .#factorio-server-mini \
  --target-host deploy@<mini-ip> \
  --use-remote-sudo

# Deploy to stream host
nixos-rebuild switch \
  --flake .#factorio-server-stream \
  --target-host deploy@<stream-ip> \
  --use-remote-sudo
```

### 7.3 Verification

After deployment, verify:

```bash
# Check container status
systemctl status podman-*

# Check native services
systemctl status redis caddy coturn

# Test connectivity
curl https://api.<domain>/health
```

---

## 8. Critical Configuration Points

### 8.1 Factorio Auto-Pause Prevention

Factorio headless must **not auto-pause when empty** so AI keeps running with 0 viewers/players.

In your Factorio server settings (`server-settings.json`):

```json
{
  "autosave_only_on_server": true,
  "non_blocking_saving": true,
  "auto_pause": false
}
```

### 8.2 Version Pinning Strategy

**Non-negotiable:** Keep Factorio server + GUI client + mods aligned.

```nix
# Define version once, use everywhere
let
  factorioVersion = "1.1.110";
in {
  claudetorio.factorio.serverImage = "factoriotools/factorio:${factorioVersion}";
  claudetorio.stream.factorioClientImage = "your-org/factorio-client:${factorioVersion}";
}
```

---

## 9. Network Architecture Diagram

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    PUBLIC INTERNET                       │
                    └─────────────────────────────────────────────────────────┘
                              │                              │
                              │ HTTPS (443)                  │ HTTPS (443)
                              │                              │ TURN (3478)
                              │                              │ Relay (49152-49200)
                              v                              v
┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐
│     factorio-server-mini            │    │     factorio-server-stream          │
│     (Control Plane)                 │    │     (Streaming Tier)                │
│                                     │    │                                     │
│  ┌─────────────┐  ┌──────────────┐  │    │  ┌─────────────┐  ┌──────────────┐  │
│  │   Caddy     │  │    Redis     │  │    │  │   Caddy     │  │   coturn     │  │
│  │  (native)   │  │   (native)   │  │    │  │  (native)   │  │  (native)    │  │
│  └──────┬──────┘  └──────────────┘  │    │  └──────┬──────┘  └──────────────┘  │
│         │                 ^         │    │         │                           │
│         v                 │         │    │         v                           │
│  ┌─────────────┐          │         │    │  ┌─────────────────────────────┐    │
│  │   Broker    │──────────┘         │    │  │  StreamClient Pool          │    │
│  │ (container) │                    │    │  │  ┌─────┐ ┌─────┐ ┌─────┐    │    │
│  └─────────────┘                    │    │  │  │ c01 │ │ c02 │ │ c03 │    │    │
│                                     │    │  │  └──┬──┘ └──┬──┘ └──┬──┘    │    │
└─────────────────────────────────────┘    │  └─────│──────│──────│─────────┘    │
                                           └────────│──────│──────│──────────────┘
                                                    │      │      │
                    ┌───────────────────────────────┴──────┴──────┴───────────────┐
                    │                    PRIVATE NETWORK (Tailscale)               │
                    └───────────────────────────────┬─────────────────────────────┘
                                                    │
                                                    │ Factorio UDP + RCON
                                                    v
                    ┌─────────────────────────────────────────────────────────────┐
                    │                 factorio-server (Game Tier)                  │
                    │                                                             │
                    │  ┌─────────────────────────────────────────────────────┐    │
                    │  │              Headless Factorio Servers               │    │
                    │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │    │
                    │  │  │ g01 │ │ g02 │ │ g03 │ │ g04 │ │ ... │           │    │
                    │  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘           │    │
                    │  └─────────────────────────────────────────────────────┘    │
                    └─────────────────────────────────────────────────────────────┘
```

---

## 10. Alternative Configurations

### 10.1 Private-Only Factorio (Tailscale-Only)

For maximum security, never expose Factorio UDP publicly:

```nix
# In game-server.nix
networking.firewall = {
  # Only allow Factorio traffic on Tailscale interface
  interfaces.tailscale0 = {
    allowedUDPPorts = [ 34197 34198 34199 ];
    allowedTCPPorts = [ 27015 27016 27017 ];  # RCON
  };
  # Public interface: SSH only
  allowedTCPPorts = [ 22 ];
};
```

### 10.2 Single Domain Layout

Both API and streams behind one edge box:

```nix
# All traffic through factorio-server-stream
services.caddy.virtualHosts = {
  "api.example.com".extraConfig = ''
    reverse_proxy factorio-server-mini:8000
  '';
  "c01.stream.example.com".extraConfig = ''
    reverse_proxy localhost:9001
  '';
  # ...
};
```

### 10.3 Compose-Compatible Variant

Keep existing docker-compose files, but manage with Nix/systemd:

```nix
systemd.services.claudetorio-compose = {
  description = "ClaudeTorio Docker Compose Stack";
  after = [ "docker.service" ];
  wantedBy = [ "multi-user.target" ];
  serviceConfig = {
    Type = "oneshot";
    RemainAfterExit = true;
    WorkingDirectory = "/opt/claudetorio";
    ExecStart = "${pkgs.docker-compose}/bin/docker-compose up -d";
    ExecStop = "${pkgs.docker-compose}/bin/docker-compose down";
  };
};
```

---

## 11. Troubleshooting

### 11.1 Common Issues

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| Container won't start | `journalctl -u podman-<name>` | Check image exists, ports available |
| WebRTC fails | Browser console shows ICE failures | Verify TURN ports open, credentials correct |
| Factorio desync | Client logs show "desync" | Verify version match, restart client |
| Redis unreachable | Broker logs connection errors | Check `systemctl status redis` |

### 11.2 Useful Commands

```bash
# View all container logs
journalctl -u 'podman-*' -f

# Check Podman container status
podman ps -a

# Test TURN connectivity
turnutils_uclient -T -u user -w pass turn.<domain>

# Verify Caddy is serving
curl -I https://api.<domain>/health
```

---

## 12. References

- [NixOS Manual - Containers](https://nixos.org/manual/nixos/stable/#ch-containers)
- [NixOS Wiki - Podman](https://nixos.wiki/wiki/Podman)
- [sops-nix Documentation](https://github.com/Mic92/sops-nix)
- [Tailscale NixOS Module](https://tailscale.com/kb/1096/nixos)
- [Caddy NixOS Module](https://search.nixos.org/options?channel=unstable&query=services.caddy)
