import httpx

from config import RUN_WORKER_API_KEY


def _report_headers() -> dict:
    if RUN_WORKER_API_KEY:
        return {"Authorization": f"Bearer {RUN_WORKER_API_KEY}"}
    return {}


def report_step(broker_url: str, run_id: str, step_idx: int, code: str, **kwargs):
    """Report a step to the broker (fire-and-forget, best effort)."""
    try:
        payload = {"step_idx": step_idx, "code": code, **kwargs}
        # Sanitise numpy/non-JSON-native types
        for k, v in payload.items():
            if hasattr(v, 'item'):  # numpy scalar
                payload[k] = v.item()
        resp = httpx.post(
            f"{broker_url}/api/internal/runs/{run_id}/steps",
            json=payload,
            headers=_report_headers(),
            timeout=10,
        )
        if resp.status_code >= 400:
            print(f"Warning: step {step_idx} report returned {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        print(f"Warning: failed to report step {step_idx}: {e}")


def report_complete(broker_url: str, run_id: str, final_score: float | None, status: str = "completed", error: str | None = None):
    """Report run completion to the broker (best effort)."""
    try:
        # Sanitise numpy scalars
        if hasattr(final_score, 'item'):
            final_score = final_score.item()
        resp = httpx.post(
            f"{broker_url}/api/internal/runs/{run_id}/complete",
            json={"final_score": final_score, "status": status, "error": error},
            headers=_report_headers(),
            timeout=10,
        )
        if resp.status_code >= 400:
            print(f"Warning: complete report returned {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        print(f"Warning: failed to report run completion: {e}")
