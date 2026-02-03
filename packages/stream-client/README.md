# Factorio Stream Prototype

Bare-bones setup to stream Factorio via WebRTC using Selkies-GStreamer.

## Quick Architecture

```
Your AI Agent (MCP/RCON) ──────┐
                               ▼
                         ┌──────────┐
                         │ Factorio │ (with graphics)
                         │ Server   │
                         └────┬─────┘
                              │
                         ┌────▼─────┐
                         │ Selkies  │ (WebRTC)
                         │ GStreamer│
                         └────┬─────┘
                              │
                         Browser (observe only)
```

## Step 1: Test Selkies Works

Before adding Factorio complexity, verify Selkies works on your server:

```bash
chmod +x test-selkies.sh
./test-selkies.sh
```

Open `http://YOUR_SERVER_IP:8080` in browser.
- Username: `ubuntu`
- Password: `mypasswd`

You should see a desktop with Firefox. If this works, Selkies is good!

## Step 2: Get Factorio (Full Version)

You need the **FULL** Factorio, not headless. Headless has no graphics!

```bash
# Download from factorio.com (requires account)
# Or if you have Steam, you can copy from there

mkdir -p factorio
cd factorio

# Option A: Download directly (replace with your actual download URL)
wget "https://factorio.com/get-download/stable/alpha/linux64" -O factorio.tar.xz
tar -xf factorio.tar.xz --strip-components=1

# Option B: Copy from existing Steam install
# cp -r ~/.steam/steam/steamapps/common/Factorio/* .
```

## Step 3: Create Server Settings

```bash
mkdir -p factorio-data

cat > factorio-data/server-settings.json << 'EOF'
{
  "name": "ClaudeTorio Stream",
  "description": "AI-controlled Factorio",
  "visibility": {"public": false, "lan": false},
  "require_user_verification": false,
  "autosave_interval": 5,
  "autosave_slots": 3,
  "afk_autokick_interval": 0,
  "auto_pause": false
}
EOF
```

## Step 4: Build and Run

```bash
docker-compose build
docker-compose up -d
```

Access at: `http://YOUR_SERVER_IP:3000`
- Username: `viewer`
- Password: `factorio123`

## Step 5: Connect Your AI Agent

Your AI agent connects via RCON exactly as before:

```python
# Example - your existing MCP/RCON code should work unchanged
import factorio_rcon

client = factorio_rcon.RCONClient("localhost", 27015, "your-rcon-password-here")
client.send_command("/c game.print('Hello from AI!')")
```

## Observe-Only Mode

The `DISABLE_CONTROL=true` environment variable prevents browser users from 
sending keyboard/mouse input. They can only watch.

To enable control (for testing), set `DISABLE_CONTROL=false`.

## Troubleshooting

### Black screen in browser
- Check Factorio started: `docker logs factorio-stream`
- Make sure you have the FULL Factorio, not headless

### WebRTC connection fails
- Using `network_mode: host` should avoid most issues
- If behind NAT, you may need a TURN server

### Low framerate
- Reduce resolution: `DISPLAY_WIDTH=1280`, `DISPLAY_HEIGHT=720`
- Lower framerate: `DISPLAY_REFRESH_RATE=20`
- If you have NVIDIA GPU, the base image can use NVENC

### RCON not connecting
- Verify port 27015 is accessible
- Check RCON_PASSWORD matches in docker-compose and your agent

## Next Steps

1. **Multiple sessions**: Run multiple containers on different ports
2. **Frontend integration**: Embed the stream in your React dashboard
3. **GPU acceleration**: Add NVIDIA runtime for better performance
4. **Authentication**: Add proper auth instead of basic auth

## Files

```
factorio-stream/
├── Dockerfile              # Container definition
├── docker-compose.yml      # Easy orchestration
├── test-selkies.sh        # Quick test script
├── root/defaults/autostart # Tells container to run Factorio
├── scripts/start-factorio.sh  # Factorio launch wrapper
├── factorio/              # (you provide) Full Factorio install
└── factorio-data/         # (created) Saves, mods, settings
```
