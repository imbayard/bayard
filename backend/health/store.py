"""Local mirror of WHOOP cycles + recovery, keyed by local calendar day.

WHOOP caps pages at 25 records, so a year is ~30 sequential requests and all
time is ~50 — far too slow to do inside a request handler. Sync once, then read
locally. This also lets the graph join WHOOP against other sources later.
"""

import datetime as dt
from contextlib import asynccontextmanager

import aiosqlite

from backend.config import DATA_DIR
from backend.integrations import whoop

DB_PATH = DATA_DIR / "health.db"

# Recovery lands after the night's sleep is scored, and the newest cycle is
# still open, so the tail of the mirror is provisional. Re-pull a few days on
# every sync rather than trusting what we stored yesterday.
RESYNC_DAYS = 5


@asynccontextmanager
async def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def create_table() -> None:
    async with get_db() as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS whoop_days (
                local_date TEXT PRIMARY KEY,
                cycle_id   INTEGER NOT NULL,
                strain     REAL,
                recovery   REAL,
                partial    INTEGER NOT NULL DEFAULT 0,
                synced_at  TEXT NOT NULL
            )
            """
        )
        await db.commit()


def _iso(moment: dt.datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def local_date(record: dict) -> dt.date:
    """The calendar day a cycle represents, in the user's own timezone.

    Two wrinkles. Timezone first: `timezone_offset` moves with travel, so
    bucketing on UTC would shift columns mid-trip. Then the boundary: a WHOOP
    cycle begins at sleep onset, which lands either side of local midnight
    (23:59 one night, 00:42 the next). Taking the raw local date would file
    late-evening starts under the previous day and collide two cycles onto one
    column, blanking the day beside it. Rounding to the nearest midnight files
    each cycle under the day it actually covers.
    """
    started = dt.datetime.fromisoformat(record["start"].replace("Z", "+00:00"))
    offset = record.get("timezone_offset") or "+00:00"
    sign = -1 if offset[0] == "-" else 1
    hours, minutes = int(offset[1:3]), int(offset[4:6])
    return (started + sign * dt.timedelta(hours=hours, minutes=minutes)
            + dt.timedelta(hours=12)).date()


def _fetch_all(path: str, start: dt.datetime, end: dt.datetime) -> list[dict]:
    records, token = [], None
    while True:
        page = whoop.get(
            path, start=_iso(start), end=_iso(end), limit=25, nextToken=token
        )
        records += page.get("records", [])
        token = page.get("next_token")
        if not token:
            return records


async def sync(since: dt.datetime | None = None) -> dict:
    """Pull WHOOP into the mirror. Incremental by default, full when empty."""
    now = dt.datetime.utcnow()
    if since is None:
        async with get_db() as db:
            cursor = await db.execute("SELECT MAX(local_date) AS d FROM whoop_days")
            newest = (await cursor.fetchone())["d"]
        since = (
            dt.datetime.fromisoformat(newest) - dt.timedelta(days=RESYNC_DAYS)
            if newest
            else dt.datetime(2012, 1, 1)  # predates WHOOP; first sync pulls everything
        )

    cycles = _fetch_all("/v2/cycle", since, now)
    # Cycles come back if they *overlap* the window, but recoveries are filtered
    # on their own timestamp — and a recovery is created hours after the cycle
    # it scores begins. A cycle straddling the window's start would otherwise
    # arrive with its recovery left outside, so widen the recovery side.
    recoveries = _fetch_all("/v2/recovery", since - dt.timedelta(days=2), now)
    by_cycle = {r["cycle_id"]: r for r in recoveries}

    rows = []
    for cycle in cycles:
        score = cycle.get("score") or {}
        recovery = by_cycle.get(cycle["id"]) or {}
        recovery_score = recovery.get("score") or {}
        rows.append(
            (
                local_date(cycle).isoformat(),
                cycle["id"],
                score.get("strain") if cycle["score_state"] == "SCORED" else None,
                (
                    recovery_score.get("recovery_score")
                    if recovery.get("score_state") == "SCORED"
                    else None
                ),
                # A cycle with no end is still accumulating — today's strain is
                # not a finished number.
                1 if cycle.get("end") is None else 0,
                now.isoformat(),
            )
        )

    async with get_db() as db:
        await db.executemany(
            """
            INSERT INTO whoop_days (local_date, cycle_id, strain, recovery, partial, synced_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(local_date) DO UPDATE SET
                cycle_id=excluded.cycle_id, strain=excluded.strain,
                -- Never let an absent recovery erase one already known: a
                -- partial sync can legitimately fetch a cycle without it.
                recovery=COALESCE(excluded.recovery, whoop_days.recovery),
                partial=excluded.partial,
                synced_at=excluded.synced_at
            """,
            rows,
        )
        await db.commit()
    return {"synced": len(rows), "since": since.date().isoformat()}


async def get_days(start: dt.date, end: dt.date) -> dict[dt.date, dict]:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM whoop_days WHERE local_date BETWEEN ? AND ? ORDER BY local_date",
            (start.isoformat(), end.isoformat()),
        )
        return {
            dt.date.fromisoformat(row["local_date"]): {
                "strain": row["strain"],
                "recovery": row["recovery"],
                "partial": bool(row["partial"]),
            }
            for row in await cursor.fetchall()
        }


async def coverage() -> dict:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS n, MIN(local_date) AS lo, MAX(local_date) AS hi FROM whoop_days"
        )
        row = await cursor.fetchone()
        return {"days": row["n"], "first": row["lo"], "last": row["hi"]}
