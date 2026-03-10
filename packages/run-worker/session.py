import httpx


def claim_session(broker_url: str, username: str) -> tuple[str, int, int]:
    """Claim a session from the broker, retrying if a stale session exists.

    Returns:
        (session_id, rcon_port, slot)
    """
    print(f"Claiming session from {broker_url} as '{username}'...")
    resp = httpx.post(
        f"{broker_url}/api/session/claim",
        json={"username": username},
        timeout=30,
    )

    # If user already has an active session (409), release it and retry
    if resp.status_code == 409:
        detail = resp.json().get("detail", "")
        print(f"Stale session detected: {detail}")
        parts = detail.split("active session ")
        if len(parts) > 1:
            stale_id = parts[1].split(" ")[0]
            print(f"Releasing stale session {stale_id}...")
            try:
                release_resp = httpx.post(
                    f"{broker_url}/api/session/{stale_id}/release",
                    json={},
                    timeout=30,
                )
                release_resp.raise_for_status()
                print("Stale session released, retrying claim...")
            except Exception as e:
                print(f"Warning: failed to release stale session: {e}")
        resp = httpx.post(
            f"{broker_url}/api/session/claim",
            json={"username": username},
            timeout=30,
        )

    resp.raise_for_status()
    claim = resp.json()

    session_id = claim["session_id"]
    rcon_port = claim["rcon_port"]
    slot = claim["slot"]
    print(f"Claimed session {session_id} (slot {slot}, rcon_port {rcon_port})")
    return session_id, rcon_port, slot


def release_session(broker_url: str, session_id: str):
    """Release a session (best effort)."""
    print(f"\nReleasing session {session_id}...")
    try:
        resp = httpx.post(
            f"{broker_url}/api/session/{session_id}/release",
            json={},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        print(f"Session released. Final score: {data.get('final_score', '?')}")
    except Exception as e:
        print(f"Warning: failed to release session: {e}")
