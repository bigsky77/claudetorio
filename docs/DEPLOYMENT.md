# Deployment Pipeline

Claudetorio uses a simple git-based deployment pipeline. Pushes to `main` automatically deploy to production servers.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Push to main   │────▶│   GitHub Actions     │────▶│  Production Servers │
└─────────────────┘     │  (.github/workflows/ │     │                     │
                        │   deploy.yml)        │     │  - game-server      │
                        └──────────────────────┘     │  - stream-server    │
                                                     └─────────────────────┘
```

## Servers

| Server | Host | Purpose | Deployed Components |
|--------|------|---------|---------------------|
| `factorio-server` | 157.254.222.103 | Game simulation | broker, frontend, postgres, redis |
| `factorio-server-mini` | 157.254.222.104 | Stream rendering | stream-client, caddy |

## How It Works

1. **Push to main** triggers the deploy workflow
2. **Change detection** determines which server(s) need updates:
   - `packages/stream-client/` or `machines/stream-server/` → stream-server
   - Everything else → game-server
   - `.github/workflows/deploy.yml` or `scripts/` → both servers
3. **SSH to server** and run:
   ```bash
   git fetch origin main
   git reset --hard origin/main
   docker compose up --build -d
   ```
4. **Health check** verifies services are running
5. **Record SHA** in `.deployed-sha` for rollback capability

## Rollback

Both servers roll back atomically (together) to ensure consistency.

### Quick Rollback (previous deployment)
```bash
./scripts/rollback.sh
```

### Rollback to Specific SHA
```bash
./scripts/rollback.sh abc1234
```

### Manual Rollback
```bash
# On each server:
cd /opt/claudetorio
git fetch origin
git reset --hard <sha>
cd machines/<server-type>
docker compose up --build -d
```

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `DEPLOY_SSH_KEY` | Base64-encoded SSH private key |
| `KNOWN_HOSTS` | SSH host keys for both servers |
| `GAME_SERVER_HOST` | IP address of game server |
| `STREAM_SERVER_HOST` | IP address of stream server |

### Updating the Deploy Key

1. Generate new key:
   ```bash
   ssh-keygen -t ed25519 -C "claudetorio-deploy" -f /tmp/deploy_key -N ""
   ```

2. Add public key to both servers:
   ```bash
   cat /tmp/deploy_key.pub | ssh factorio-server "cat >> ~/.ssh/authorized_keys"
   cat /tmp/deploy_key.pub | ssh factorio-server-mini "cat >> ~/.ssh/authorized_keys"
   ```

3. Base64 encode and update GitHub secret:
   ```bash
   base64 -w0 /tmp/deploy_key
   # Copy output to DEPLOY_SSH_KEY secret
   ```

## Server Directory Structure

Both servers use the same structure:

```
/opt/claudetorio/           # Git repo root
├── .deployed-sha           # Current deployed commit
├── .deployed-sha.prev      # Previous deployment (for rollback)
├── packages/
│   ├── broker/
│   ├── frontend/
│   └── stream-client/
└── machines/
    ├── game-server/
    │   ├── docker-compose.yml
    │   └── .env
    └── stream-server/
        ├── docker-compose.yml
        └── .env
```

## Monitoring Deployments

### Check deployment status
```bash
# Game server
ssh factorio-server "cat /opt/claudetorio/.deployed-sha && docker ps | grep claudetorio"

# Stream server
ssh factorio-server-mini "cat /opt/claudetorio/.deployed-sha && docker ps | grep -E '(caddy|stream)'"
```

### View deployment logs
```bash
# On GitHub
gh run list
gh run view <run-id> --log
```

### Health checks
```bash
# Game server API
curl http://157.254.222.103:8080/api/status

# Frontend
curl http://157.254.222.103:3000

# Stream server
curl https://c0.stream.claudetorio.ai
```

## Troubleshooting

### Deploy fails with SSH error
- Verify `DEPLOY_SSH_KEY` secret is base64 encoded
- Check `KNOWN_HOSTS` contains both server fingerprints
- Test SSH manually: `ssh -i key root@<host> "echo ok"`

### Containers won't start
```bash
# Check logs
docker logs <container-name>

# Restart stack
cd /opt/claudetorio/machines/<server>
docker compose down
docker compose up -d
```

### Port conflicts
```bash
# Find process using port
ss -tlnp | grep <port>
fuser -k <port>/tcp
```

### Database connection issues
The broker uses host networking to connect to postgres via localhost. If it fails:
```bash
# Verify postgres is healthy
docker exec claudetorio-postgres pg_isready -U claudetorio

# Check broker can reach it
curl http://localhost:8080/api/status
```
