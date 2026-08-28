from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from . import google

# 0=Mon … 6=Sun  →  RRULE BYDAY tokens
_RRULE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

_timezone: str | None = None


def _service():
    return google.get_service("calendar", "v3")


def get_timezone() -> str:
    global _timezone
    if _timezone is None:
        cal = _service().calendars().get(calendarId="primary").execute()
        _timezone = cal.get("timeZone", "UTC")
    return _timezone


def _localize(naive_str: str) -> datetime:
    """Parse a naive datetime string and attach the calendar's local timezone."""
    dt = datetime.fromisoformat(naive_str)
    return dt.replace(tzinfo=ZoneInfo(get_timezone()))


def get_events(start: str, end: str) -> list[dict]:
    result = (
        _service()
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
        bayard_type = ext.get("bayard_type")  # "module" | "habit" | "draft" | None

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


def create_event(
    app: str,
    title: str,
    start: str,
    end: str,
    *,
    recurrence: list[str] | None = None,
    event_type: str = "event",
    extra_props: dict[str, str] | None = None,
) -> str:
    """Create a Google Calendar event tagged with its owning app. Returns event id.

    `start`/`end` are naive local datetime strings (e.g. "2026-08-26T14:00").
    """
    tz = get_timezone()
    start_dt = _localize(start)
    end_dt = _localize(end)

    event = {
        "summary": title,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": tz},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": tz},
        "extendedProperties": {
            "private": {"bayard_app": app, "bayard_type": event_type, **(extra_props or {})}
        },
    }
    if recurrence:
        event["recurrence"] = recurrence

    created = _service().events().insert(calendarId="primary", body=event).execute()
    return created["id"]


def create_habit(
    app: str, title: str, days_of_week: list[int], start_time: str, duration_minutes: int
) -> str:
    """Create a recurring weekly Google Calendar event. Returns event id."""
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

    return create_event(
        app,
        title,
        start_dt.replace(tzinfo=None).isoformat(),
        end_dt.replace(tzinfo=None).isoformat(),
        recurrence=[f"RRULE:FREQ=WEEKLY;BYDAY={byday}"],
        event_type="habit",
    )


def delete_event(event_id: str) -> None:
    _service().events().delete(calendarId="primary", eventId=event_id).execute()
