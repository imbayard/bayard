import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from backend.config import DATA_DIR

# Google returns `openid` alongside userinfo.email whether or not it was asked for, and
# oauthlib treats the grant coming back wider than the request as an error. Without this
# the consent callback dies on "Scope has changed".
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

INTEGRATIONS_DIR = Path(__file__).parent.parent
# Token is written at runtime, so it lives in DATA_DIR (a volume on Railway).
# credentials.json is supplied, not generated, so it stays beside the code.
TOKEN_FILE = DATA_DIR / "token.json"
CREDENTIALS_FILE = INTEGRATIONS_DIR / "credentials.json"
SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
    # Who "send to self" means. gmail.send alone can't read it back — Gmail's getProfile
    # needs a read scope — so the address comes from the OAuth userinfo endpoint instead.
    "https://www.googleapis.com/auth/userinfo.email",
]

# Module-level cache so we don't rebuild services on every request
_services: dict[str, object] = {}


def is_authenticated() -> bool:
    return TOKEN_FILE.exists()


def clear_token() -> None:
    global _services
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
    _services = {}


def get_service(api: str, version: str):
    global _services
    if not TOKEN_FILE.exists():
        raise RuntimeError("Not authenticated. Visit /integrations/oauth/start.")
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json())
        _services = {}
    key = f"{api}/{version}"
    if key not in _services:
        _services[key] = build(api, version, credentials=creds)
    return _services[key]
