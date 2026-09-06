import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel

from . import calendar as gcal
from . import gmail
from . import google
from . import whoop

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

_WHOOP_REDIRECT = os.environ.get(
    "WHOOP_REDIRECT_URI", "http://localhost:8000/oauth/whoop/callback"
)
_whoop_state: str | None = None


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


# ── WHOOP ──────────────────────────────────────────────────────────────────────
#
# No Python SDK, so the flow is hand-rolled against WHOOP's OAuth2 endpoints.
# Two things differ from Google: `state` must be at least eight characters or
# WHOOP rejects the authorize request, and refresh tokens rotate on every use
# (see whoop.save_token).

@router.get("/whoop/oauth/status")
async def whoop_oauth_status():
    return {
        "configured": whoop.is_configured(),
        "authenticated": whoop.is_authenticated(),
    }


@router.get("/whoop/oauth/start")
async def whoop_oauth_start():
    global _whoop_state
    if not whoop.is_configured():
        raise HTTPException(400, "WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET not set.")
    _whoop_state = secrets.token_urlsafe(16)
    params = urlencode(
        {
            "client_id": whoop.client_id(),
            "redirect_uri": _WHOOP_REDIRECT,
            "response_type": "code",
            "scope": " ".join(whoop.SCOPES),
            "state": _whoop_state,
        }
    )
    return RedirectResponse(f"{whoop.AUTH_URL}?{params}")


@callback_router.get("/oauth/whoop/callback")
async def whoop_oauth_callback(code: str, state: str):
    global _whoop_state
    if _whoop_state is None or not secrets.compare_digest(state, _whoop_state):
        raise HTTPException(400, "State mismatch. Restart at /integrations/whoop/oauth/start.")
    _whoop_state = None
    response = httpx.post(
        whoop.TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _WHOOP_REDIRECT,
            "client_id": whoop.client_id(),
            "client_secret": whoop.client_secret(),
        },
        timeout=15.0,
    )
    if response.status_code >= 400:
        raise HTTPException(502, f"WHOOP token exchange failed: {response.text}")
    whoop.save_token(response.json())
    return {"ok": True, "message": "WHOOP connected! You can close this tab."}


@router.delete("/whoop/oauth")
async def whoop_disconnect():
    whoop.clear_token()
    return {"ok": True}


def _whoop_get(path: str, **params):
    if not whoop.is_authenticated():
        raise HTTPException(401, "WHOOP not connected.")
    try:
        return whoop.get(path, **params)
    except RuntimeError as e:
        raise HTTPException(401, str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"WHOOP API error: {e.response.text}")


@router.get("/whoop/recovery")
async def whoop_recovery(start: str | None = None, end: str | None = None, limit: int = 25):
    return _whoop_get("/v2/recovery", start=start, end=end, limit=limit)


@router.get("/whoop/cycles")
async def whoop_cycles(start: str | None = None, end: str | None = None, limit: int = 25):
    return _whoop_get("/v2/cycle", start=start, end=end, limit=limit)


@router.get("/whoop/sleep")
async def whoop_sleep(start: str | None = None, end: str | None = None, limit: int = 25):
    return _whoop_get("/v2/activity/sleep", start=start, end=end, limit=limit)


@router.get("/whoop/workouts")
async def whoop_workouts(start: str | None = None, end: str | None = None, limit: int = 25):
    return _whoop_get("/v2/activity/workout", start=start, end=end, limit=limit)


@router.get("/whoop/profile")
async def whoop_profile():
    return _whoop_get("/v2/user/profile/basic")


@router.get("/whoop/body")
async def whoop_body():
    return _whoop_get("/v2/user/measurement/body")
