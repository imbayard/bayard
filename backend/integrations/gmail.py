import base64
from email.mime.text import MIMEText

from . import google

_self_address: str | None = None


def _service():
    return google.get_service("gmail", "v1")


def _own_address() -> str:
    global _self_address
    if _self_address is None:
        profile = _service().users().getProfile(userId="me").execute()
        _self_address = profile["emailAddress"]
    return _self_address


def send_email(app: str, subject: str, body: str, to: str | None = None) -> str:
    """Send an email via Gmail, defaulting to the authenticated user's own address. Returns message id."""
    message = MIMEText(body)
    message["to"] = to or _own_address()
    message["subject"] = f"[{app}] {subject}"
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    sent = _service().users().messages().send(userId="me", body={"raw": raw}).execute()
    return sent["id"]
