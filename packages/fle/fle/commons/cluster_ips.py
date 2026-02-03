import subprocess
import json
import os
from typing import List


def get_local_container_ips() -> tuple[List[str], List[int], List[int]]:
    """Get IP addresses of running Factorio containers.

    If FLE_SERVER_HOST and FLE_RCON_PORT environment variables are set,
    uses those for remote connection instead of local Docker discovery.
    """
    # Check for remote server configuration via environment variables
    remote_host = os.environ.get("FLE_SERVER_HOST")
    remote_rcon_port = os.environ.get("FLE_RCON_PORT")

    if remote_host and remote_rcon_port:
        # Remote mode - use environment variables
        try:
            tcp_port = int(remote_rcon_port)
            # Calculate UDP port from RCON port (UDP = RCON - 27000 + 34197)
            udp_port = tcp_port - 27000 + 34197
            return [remote_host], [udp_port], [tcp_port]
        except ValueError:
            print(f"Invalid FLE_RCON_PORT: {remote_rcon_port}")
            return [], [], []

    # Local mode - use Docker discovery
    # Get container IDs for factorio containers
    cmd = ["docker", "ps", "--filter", "name=factorio_", "--format", '"{{.ID}}"']
    result = subprocess.run(cmd, capture_output=True, text=True)
    container_ids = result.stdout.strip().split("\n")
    container_ids = [id.strip('"') for id in container_ids]

    if not container_ids or container_ids[0] == "":
        print("No running Factorio containers found")
        return [], [], []

    ips = []
    udp_ports = []
    tcp_ports = []
    for container_id in container_ids:
        # Get container details in JSON format
        cmd = ["docker", "inspect", container_id]
        result = subprocess.run(cmd, capture_output=True, text=True)
        container_info = json.loads(result.stdout)

        # Get host ports for UDP game port
        ports = container_info[0]["NetworkSettings"]["Ports"]

        # Find the UDP port mapping
        for port, bindings in ports.items():
            if "/udp" in port and bindings:
                udp_port = bindings[0]["HostPort"]
                udp_ports.append(int(udp_port))

            if "/tcp" in port and bindings:
                tcp_port = bindings[0]["HostPort"]
                tcp_ports.append(int(tcp_port))

        # Append the IP address with the UDP port to the list
        ips.append("127.0.0.1")

    # order by port number
    udp_ports.sort(key=lambda x: int(x))
    tcp_ports.sort(key=lambda x: int(x))

    return ips, udp_ports, tcp_ports


if __name__ == "__main__":
    ips, udp_ports, tcp_ports = get_local_container_ips()
    if ips:
        print("Local Factorio container addresses:")
        for ip in ips:
            print(ip)
    else:
        print("No local Factorio containers found.")
