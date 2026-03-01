from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

BACKEND_DIR = Path(__file__).parent.parent
TOKEN_FILE = BACKEND_DIR / "token.json"
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# 0=Mon … 6=Sun  →  RRULE BYDAY tokens
_RRULE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

# Module-level cache so we don't rebuild the service on every request
_service = None
_timezone: str | None = None


def is_authenticated() -> bool:
    return TOKEN_FILE.exists()


def get_service():
    global _service, _timezone
    if not TOKEN_FILE.exists():
        raise RuntimeError("Not authenticated. Visit /oauth/start.")
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json())
        # Rebuild service and clear timezone cache so they use the refreshed credentials
        _service = None
        _timezone = None
    if _service is None:
        _service = build("calendar", "v3", credentials=creds)
    return _service


def get_timezone() -> str:
    global _timezone
    if _timezone is None:
        cal = get_service().calendars().get(calendarId="primary").execute()
        _timezone = cal.get("timeZone", "UTC")
    return _timezone


def get_events(start: str, end: str) -> list[dict]:
    result = (
        get_service()
        .events()
        .list(
            calendarId="primary",
            timeMin=start,
            timeMax=end,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    events = []
    for item in result.get("items", []):
        start_obj = item.get("start", {})
        end_obj = item.get("end", {})

        # Skip all-day events (date-only, no time component)
        if "dateTime" not in start_obj:
            continue

        ext = item.get("extendedProperties", {}).get("private", {})
        bayard_type = ext.get("bayard_type")  # "module" | "habit" | None

        events.append(
            {
                "id": item["id"],
                "title": item.get("summary", "(no title)"),
                "start": start_obj["dateTime"],
                "end": end_obj["dateTime"],
                "type": bayard_type or "external",
                "series_id": item.get("recurringEventId"),
                "module_id": int(ext["module_id"]) if ext.get("module_id") else None,
            }
        )
    return events


def _localize(naive_str: str) -> datetime:
    """Parse a naive datetime string and attach the calendar's local timezone."""
    dt = datetime.fromisoformat(naive_str)
    return dt.replace(tzinfo=ZoneInfo(get_timezone()))


def create_module_block(module_id: int, title: str, start: str, end: str) -> str:
    """Create a one-off Google Calendar event for a module block. Returns event id."""
    tz = get_timezone()
    start_dt = _localize(start)
    end_dt = _localize(end)

    event = {
        "summary": title,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": tz},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": tz},
        "extendedProperties": {
            "private": {"bayard_type": "module", "module_id": str(module_id)}
        },
    }
    created = get_service().events().insert(calendarId="primary", body=event).execute()
    return created["id"]


def create_habit(
    title: str, days_of_week: list[int], start_time: str, duration_minutes: int
) -> str:
    """Create a recurring weekly Google Calendar event for a habit. Returns event id."""
    tz_str = get_timezone()
    tz = ZoneInfo(tz_str)
    h, m = map(int, start_time.split(":"))

    # Find the next calendar day that falls on one of the requested weekdays
    now = datetime.now(tz)
    start_dt = None
    for i in range(7):
        candidate = (now + timedelta(days=i)).replace(
            hour=h, minute=m, second=0, microsecond=0
        )
        if candidate.weekday() in days_of_week:  # weekday() is 0=Mon…6=Sun — matches our convention
            start_dt = candidate
            break
    if start_dt is None:
        start_dt = now.replace(hour=h, minute=m, second=0, microsecond=0)

    end_dt = start_dt + timedelta(minutes=duration_minutes)
    byday = ",".join(_RRULE_DAYS[d] for d in sorted(days_of_week))

    event = {
        "summary": title,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": tz_str},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": tz_str},
        "recurrence": [f"RRULE:FREQ=WEEKLY;BYDAY={byday}"],
        "extendedProperties": {"private": {"bayard_type": "habit"}},
    }
    created = get_service().events().insert(calendarId="primary", body=event).execute()
    return created["id"]


def delete_event(event_id: str) -> None:
    get_service().events().delete(calendarId="primary", eventId=event_id).execute()
