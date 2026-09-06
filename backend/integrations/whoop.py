import json
import os
import time

import httpx

from backend.config import DATA_DIR

TOKEN_FILE = DATA_DIR / "whoop_token.json"

AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
API_BASE = "https://api.prod.whoop.com/developer"

SCOPES = [
    "read:recovery",
    "read:cycles",
    "read:sleep",
    "read:workout",
    "read:profile",
    "read:body_measurement",
    "offline",  # required to receive a refresh token at all
]

# Refresh this many seconds before the token actually expires, so a request
# never lands on a token that dies in flight.
_EXPIRY_SKEW = 60


def client_id() -> str:
    return os.environ.get("WHOOP_CLIENT_ID", "")


def client_secret() -> str:
    return os.environ.get("WHOOP_CLIENT_SECRET", "")


def is_configured() -> bool:
    return bool(client_id() and client_secret())


def is_authenticated() -> bool:
    return TOKEN_FILE.exists()


def clear_token() -> None:
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()


def save_token(payload: dict) -> None:
    """Persist a token response, stamping an absolute expiry.

    WHOOP rotates refresh tokens: every refresh returns a NEW refresh_token and
    invalidates the old one. Losing this write means losing the connection, so
    the whole payload gets written before it's used.
    """
    payload = dict(payload)
    payload["expires_at"] = time.time() + payload.get("expires_in", 3600)
    TOKEN_FILE.write_text(json.dumps(payload))


def _load() -> dict:
    if not TOKEN_FILE.exists():
        raise RuntimeError("Not authenticated. Visit /integrations/whoop/oauth/start.")
    return json.loads(TOKEN_FILE.read_text())


def _refresh(token: dict) -> dict:
    refresh_token = token.get("refresh_token")
    if not refresh_token:
        clear_token()
        raise RuntimeError("No refresh token — reconnect WHOOP with the 'offline' scope.")
    response = httpx.post(
        TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id(),
            "client_secret": client_secret(),
            "scope": "offline",
        },
        timeout=15.0,
    )
    if response.status_code >= 400:
        clear_token()
        raise RuntimeError(f"WHOOP token refresh failed: {response.text}")
    fresh = response.json()
    save_token(fresh)
    return fresh


def _access_token() -> str:
    token = _load()
    if time.time() >= token.get("expires_at", 0) - _EXPIRY_SKEW:
        token = _refresh(token)
    return token["access_token"]


def get(path: str, **params) -> dict:
    """GET a v2 API path, e.g. get("/v2/recovery", limit=10)."""
    access_token = _access_token()
    url = f"{API_BASE}{path}"
    params = {k: v for k, v in params.items() if v is not None}

    response = httpx.get(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        params=params,
        timeout=30.0,
    )
    # A token can still be rejected inside the skew window (e.g. another refresh
    # rotated it). Refresh once and retry before giving up.
    if response.status_code == 401:
        access_token = _refresh(_load())["access_token"]
        response = httpx.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=30.0,
        )
    response.raise_for_status()
    return response.json()
