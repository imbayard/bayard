import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel

from . import calendar as gcal
from . import gmail
from . import google

router = APIRouter(prefix="/integrations")

# The callback path is registered as an authorized redirect URI in Google Cloud
# Console, so it can't move under /integrations with everything else without
# also updating that registration. Keep it at its original path — it's an
# external contract with Google, not something other apps call.
callback_router = APIRouter()

_OAUTH_REDIRECT = os.environ.get(
    "OAUTH_REDIRECT_URI", "http://localhost:8000/oauth/callback"
)
_oauth_flow: Flow | None = None


class CreateEventRequest(BaseModel):
    app: str
    title: str
    start: str   # "YYYY-MM-DDTHH:MM" naive local time
    end: str
    recurrence: list[str] | None = None


class SendEmailRequest(BaseModel):
    app: str
    subject: str
    body: str
    to: str | None = None


# ── OAuth ──────────────────────────────────────────────────────────────────────

@router.get("/oauth/status")
async def oauth_status():
    return {"authenticated": google.is_authenticated()}


@router.get("/oauth/start")
async def oauth_start():
    global _oauth_flow
    if not google.CREDENTIALS_FILE.exists():
        raise HTTPException(400, "credentials.json not found in backend/. See setup instructions.")
    _oauth_flow = Flow.from_client_secrets_file(
        str(google.CREDENTIALS_FILE),
        scopes=google.SCOPES,
        redirect_uri=_OAUTH_REDIRECT,
    )
    auth_url, _ = _oauth_flow.authorization_url(prompt="consent")
    return RedirectResponse(auth_url)


@callback_router.get("/oauth/callback")
async def oauth_callback(code: str):
    global _oauth_flow
    if _oauth_flow is None:
        raise HTTPException(400, "No OAuth flow in progress. Visit /integrations/oauth/start first.")
    _oauth_flow.fetch_token(code=code)
    google.TOKEN_FILE.write_text(_oauth_flow.credentials.to_json())
    _oauth_flow = None
    return {"ok": True, "message": "Authenticated! You can close this tab."}


# ── Calendar ───────────────────────────────────────────────────────────────────

@router.get("/calendar/events")
async def calendar_events(start: str, end: str):
    if not google.is_authenticated():
        raise HTTPException(401, "Google not connected.")
    try:
        return {"events": gcal.get_events(start, end)}
    except Exception as e:
        if "invalid_grant" in str(e):
            google.clear_token()
            raise HTTPException(401, "Token expired. Please reconnect Google.")
        raise HTTPException(502, f"Google Calendar error: {e}")


@router.post("/calendar/events")
async def calendar_create_event(req: CreateEventRequest):
    event_id = gcal.create_event(
        req.app, req.title, req.start, req.end, recurrence=req.recurrence
    )
    return {"id": event_id}


@router.delete("/calendar/events/{event_id:path}")
async def calendar_delete_event(event_id: str):
    gcal.delete_event(event_id)
    return {"ok": True}


# ── Email ──────────────────────────────────────────────────────────────────────

@router.post("/email/send")
async def email_send(req: SendEmailRequest):
    try:
        message_id = gmail.send_email(req.app, req.subject, req.body, req.to)
    except Exception as e:
        if "invalid_grant" in str(e):
            google.clear_token()
            raise HTTPException(401, "Token expired. Please reconnect Google.")
        raise HTTPException(502, f"Gmail error: {e}")
    return {"id": message_id}
