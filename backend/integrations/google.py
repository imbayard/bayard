from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

INTEGRATIONS_DIR = Path(__file__).parent.parent
TOKEN_FILE = INTEGRATIONS_DIR / "token.json"
CREDENTIALS_FILE = INTEGRATIONS_DIR / "credentials.json"
SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
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
