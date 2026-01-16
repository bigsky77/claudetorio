#!/usr/bin/env python3
"""Factorio Mission Control Dashboard V4 - Dense Monitoring Interface
No external dependencies - pure Python stdlib
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import subprocess
import os
import glob
import re
from datetime import datetime
from urllib.parse import urlparse
from urllib.request import urlopen
import socket

# Configuration
SCREENSHOTS_DIR = "/home/bigsky/gt/factorio/mayor/rig/.claude-code/instance_27000/screenshots"
FLE_API_BASE = "http://localhost:27000"
WORKING_DIR = os.path.dirname(os.path.abspath(__file__))
GT_DIR = "/home/bigsky/gt"

# In-memory timeline events
timeline_events = []


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WORKING_DIR, **kwargs)

    def do_GET(self):
        path = urlparse(self.path).path

        routes = {
            '/': lambda: self.serve_file('dashboard_v4.html'),
            # FLE Game API
            '/api/game/position': self.api_game_position,
            '/api/game/inventory': self.api_game_inventory,
            '/api/game/metrics': self.api_game_metrics,
            '/api/game/entities/summary': self.api_entities_summary,
            '/api/screenshots': self.api_screenshots,
            # Gas Town API
            '/api/gastown/polecats': self.api_polecats,
            '/api/gastown/convoys': self.api_convoys,
            '/api/gastown/mail': self.api_mail,
            '/api/gastown/status': self.api_gastown_status,
            # Timeline
            '/api/timeline': self.api_timeline,
            # Combined status
            '/api/status': self.api_status,
        }

        if path in routes:
            routes[path]()
        elif path.startswith('/screenshots/'):
            self.serve_screenshot(path[13:])
        elif path.startswith('/api/gastown/peek/'):
            agent = path[18:]
            self.api_peek_agent(agent)
        else:
            super().do_GET()

    def send_json(self, data):
        content = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)

    def serve_file(self, filename):
        filepath = os.path.join(WORKING_DIR, filename)
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            self.send_response(200)
            ctype = 'text/html' if filename.endswith('.html') else 'application/octet-stream'
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404, f'File not found: {filename}')

    def serve_screenshot(self, filename):
        filepath = os.path.join(SCREENSHOTS_DIR, filename)
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', len(content))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404, 'Screenshot not found')

    # === FLE API Methods ===

    def fetch_fle(self, endpoint):
        try:
            socket.setdefaulttimeout(2)
            with urlopen(f"{FLE_API_BASE}{endpoint}") as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            return {"error": str(e)}

    def api_game_position(self):
        self.send_json(self.fetch_fle('/position'))

    def api_game_inventory(self):
        self.send_json(self.fetch_fle('/inventory'))

    def api_game_metrics(self):
        data = self.fetch_fle('/metrics')
        self.send_json(data)

    def api_entities_summary(self):
        """Get entity summary by type with working/idle counts"""
        # Fetch entities from FLE
        entities_data = self.fetch_fle('/entities/0/0/100')

        if isinstance(entities_data, dict) and 'error' in entities_data:
            # Return mock data structure for now
            self.send_json({
                "total": 0,
                "working": 0,
                "idle": 0,
                "groups": [],
                "timestamp": datetime.now().isoformat()
            })
            return

        # Parse entities if we got data
        entities = entities_data if isinstance(entities_data, list) else []

        # Group by type
        groups = {}
        total_working = 0
        total_idle = 0

        for entity in entities:
            entity_type = entity.get('name', entity.get('type', 'unknown'))

            # Categorize into groups
            group_name = categorize_entity(entity_type)
            if group_name not in groups:
                groups[group_name] = []

            # Determine working status
            status = entity.get('status', '')
            is_working = status in ['WORKING', 'NORMAL'] or entity.get('energy', 0) > 0

            if is_working:
                total_working += 1
            else:
                total_idle += 1

            groups[group_name].append({
                "name": entity_type,
                "position": entity.get('position', {}),
                "working": is_working,
                "fuel": entity.get('fuel_pct', None),
                "status": status
            })

        # Convert to list format
        groups_list = [
            {"name": name, "entities": ents}
            for name, ents in sorted(groups.items())
        ]

        self.send_json({
            "total": len(entities),
            "working": total_working,
            "idle": total_idle,
            "groups": groups_list,
            "timestamp": datetime.now().isoformat()
        })

    def api_screenshots(self):
        try:
            files = glob.glob(os.path.join(SCREENSHOTS_DIR, "*.png"))
            files.sort(key=os.path.getmtime, reverse=True)
            screenshots = []
            for f in files[:5]:
                name = os.path.basename(f)
                mtime = datetime.fromtimestamp(os.path.getmtime(f))
                screenshots.append({
                    "name": name,
                    "timestamp": mtime.strftime("%H:%M:%S"),
                    "url": f"/screenshots/{name}"
                })
            self.send_json({"screenshots": screenshots})
        except Exception as e:
            self.send_json({"error": str(e), "screenshots": []})

    # === Gas Town API Methods ===

    def run_gt(self, args, timeout=10):
        try:
            result = subprocess.run(
                ['gt'] + args, capture_output=True, text=True,
                timeout=timeout, cwd=GT_DIR
            )
            return result.stdout, result.stderr, result.returncode
        except subprocess.TimeoutExpired:
            return "", "timeout", -1
        except Exception as e:
            return "", str(e), -1

    def api_polecats(self):
        stdout, stderr, rc = self.run_gt(['polecat', 'list', 'factorio'])
        polecats = []
        for line in stdout.split('\n'):
            line = line.strip()
            if '●' in line or '○' in line:
                active = '●' in line
                parts = line.replace('●', '').replace('○', '').strip().split()
                if parts:
                    name = parts[0]
                    status = parts[1] if len(parts) > 1 else "unknown"
                    polecats.append({
                        "name": name,
                        "active": active,
                        "status": status,
                        "short_name": name.split('/')[-1] if '/' in name else name
                    })
        self.send_json({"polecats": polecats, "timestamp": datetime.now().isoformat()})

    def api_convoys(self):
        stdout, stderr, rc = self.run_gt(['convoy', 'list'])
        convoys = []
        for line in stdout.split('\n'):
            match = re.match(r'(\d+)\.\s*🚚\s*(\S+):\s*(.+?)\s*(●|○)?$', line.strip())
            if match:
                convoys.append({
                    "number": int(match.group(1)),
                    "id": match.group(2),
                    "description": match.group(3).strip().replace("Work: ", ""),
                    "active": match.group(4) == '●' if match.group(4) else True
                })
        self.send_json({"convoys": convoys, "timestamp": datetime.now().isoformat()})

    def api_mail(self):
        stdout, stderr, rc = self.run_gt(['mail', 'inbox'])
        messages = []
        current_msg = None
        for line in stdout.split('\n'):
            line = line.strip()
            if line.startswith('●') or line.startswith('○'):
                if current_msg:
                    messages.append(current_msg)
                current_msg = {
                    "subject": line[1:].strip(),
                    "unread": line.startswith('●')
                }
            elif current_msg and line and not line.startswith('📬'):
                parts = line.split()
                if len(parts) >= 3 and parts[1] == 'from':
                    current_msg["id"] = parts[0]
                    current_msg["from"] = parts[2]
                elif len(parts) >= 1:
                    current_msg["date"] = line
        if current_msg:
            messages.append(current_msg)
        self.send_json({"messages": messages[:10], "timestamp": datetime.now().isoformat()})

    def api_peek_agent(self, agent):
        # Try tmux first
        tmux_session = f"gt-{agent.replace('/', '-')}"
        try:
            result = subprocess.run(
                ['tmux', 'capture-pane', '-t', tmux_session, '-p', '-S', '-50'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                lines = result.stdout.strip().split('\n')[-40:]
                self.send_json({"output": lines, "agent": agent, "source": "tmux"})
                return
        except:
            pass

        # Fallback to gt peek
        stdout, stderr, rc = self.run_gt(['peek', agent], timeout=5)
        if rc == 0:
            lines = stdout.strip().split('\n')[-40:]
            self.send_json({"output": lines, "agent": agent, "source": "gt-peek"})
        else:
            self.send_json({"output": ["No active session"], "agent": agent, "source": "none"})

    def api_gastown_status(self):
        polecats_stdout, _, _ = self.run_gt(['polecat', 'list', 'factorio'])
        active_count = polecats_stdout.count('●')
        total_count = polecats_stdout.count('●') + polecats_stdout.count('○')

        convoys_stdout, _, _ = self.run_gt(['convoy', 'list'])
        convoy_count = convoys_stdout.count('🚚')

        self.send_json({
            "active_polecats": active_count,
            "total_polecats": total_count,
            "active_convoys": convoy_count,
            "timestamp": datetime.now().isoformat()
        })

    def api_status(self):
        status = {
            "timestamp": datetime.now().isoformat(),
            "fle_connected": False,
            "gastown_connected": True
        }

        try:
            data = self.fetch_fle('/status')
            if 'error' not in data:
                status["fle_connected"] = True
                status["fle_status"] = data
        except:
            pass

        polecats_stdout, _, _ = self.run_gt(['polecat', 'list', 'factorio'])
        status["active_polecats"] = polecats_stdout.count('●')

        self.send_json(status)

    # === Timeline API ===

    def api_timeline(self):
        """Return timeline events"""
        # For now, generate mock timeline based on screenshots
        events = []
        try:
            files = glob.glob(os.path.join(SCREENSHOTS_DIR, "*.png"))
            files.sort(key=os.path.getmtime)
            for f in files[-10:]:
                mtime = datetime.fromtimestamp(os.path.getmtime(f))
                name = os.path.basename(f).replace('.png', '').replace('_', ' ')
                events.append({
                    "time": mtime.strftime("%H:%M"),
                    "label": name[:12],
                    "description": f"Screenshot: {name}",
                    "type": "screenshot"
                })
        except Exception as e:
            pass

        # Add some mock milestones
        if not events:
            events = [
                {"time": "10:15", "label": "Game Start", "type": "milestone"},
                {"time": "10:22", "label": "First Drill", "type": "milestone"},
                {"time": "10:35", "label": "Power On", "type": "milestone"},
            ]

        self.send_json({"events": events, "timestamp": datetime.now().isoformat()})

    def log_message(self, format, *args):
        pass  # Suppress logging


def categorize_entity(entity_type):
    """Categorize entity into a group"""
    entity_type = entity_type.lower()

    if 'mining-drill' in entity_type or 'drill' in entity_type:
        return 'Drills'
    elif 'furnace' in entity_type:
        return 'Furnaces'
    elif 'assembling' in entity_type or 'assembler' in entity_type:
        return 'Assemblers'
    elif 'inserter' in entity_type:
        return 'Inserters'
    elif 'belt' in entity_type or 'transport' in entity_type:
        return 'Belts'
    elif 'chest' in entity_type or 'container' in entity_type:
        return 'Storage'
    elif 'pole' in entity_type or 'electric' in entity_type:
        return 'Power'
    elif 'pipe' in entity_type or 'pump' in entity_type:
        return 'Fluids'
    elif 'lab' in entity_type:
        return 'Labs'
    elif 'boiler' in entity_type or 'steam' in entity_type:
        return 'Power Gen'
    else:
        return 'Other'


def run_server(port=8080):
    server_address = ('', port)
    httpd = HTTPServer(server_address, DashboardHandler)
    print(f"")
    print(f"  ╔══════════════════════════════════════════════╗")
    print(f"  ║  FACTORIO MISSION CONTROL V4                 ║")
    print(f"  ╠══════════════════════════════════════════════╣")
    print(f"  ║  Dashboard: http://localhost:{port}            ║")
    print(f"  ║  FLE API:   {FLE_API_BASE}         ║")
    print(f"  ║  Gas Town:  {GT_DIR}                  ║")
    print(f"  ╚══════════════════════════════════════════════╝")
    print(f"")
    print(f"  Press Ctrl+C to stop")
    print(f"")
    httpd.serve_forever()


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(port)
