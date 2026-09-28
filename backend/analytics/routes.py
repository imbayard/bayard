"""Read side of analytics.db, plus the run trigger and the hourly schedule.

Everything here runs in the web process, so no polars: reads are plain SQL, and runs are
launched as a subprocess (see run.py).
"""

import asyncio
import os
import pathlib
import subprocess
import sys
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import APIRouter, Depends, Header, HTTPException

from .db import DB_PATH, WINDOWS, create_tables

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEDULE_SECONDS = 3600

_TOKEN = os.environ.get("ANALYTICS_TOKEN")


def _check_token(x_analytics_token: str | None = Header(default=None)) -> None:
    # Unset locally: open, like the rest of this backend. Set on Railway and Netlify.
    if _TOKEN and x_analytics_token != _TOKEN:
        raise HTTPException(401, "Bad or missing x-analytics-token.")


router = APIRouter(prefix="/analytics", dependencies=[Depends(_check_token)])


@asynccontextmanager
async def _db():
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        yield db


_running: set[asyncio.Task] = set()


async def _spawn(kind: str, season: int | None = None) -> int:
    cmd = [sys.executable, "-m", "backend.analytics.run", kind]
    if season:
        cmd += ["--season", str(season)]
    proc = await asyncio.to_thread(subprocess.run, cmd, cwd=ROOT)
    return proc.returncode


async def schedule_loop() -> None:
    """Hourly `update` — an ingest check that only rebuilds when a feed changed. On by
    default on Railway (one replica, so one scheduler); ANALYTICS_SCHEDULE=1/0 overrides."""
    default = "1" if os.environ.get("RAILWAY_ENVIRONMENT_NAME") else "0"
    if os.environ.get("ANALYTICS_SCHEDULE", default) != "1":
        return
    await asyncio.sleep(60)  # let startup finish first
    while True:
        await _spawn("update")
        await asyncio.sleep(SCHEDULE_SECONDS)


def init() -> None:
    create_tables()


@router.post("/run")
async def run(kind: str = "update", season: int | None = None):
    """Start a run in the background. The run table is the lock, so a second trigger while
    one is going exits without doing anything; poll /analytics/health for the outcome."""
    if kind not in ("ingest", "build", "update"):
        raise HTTPException(400, "kind must be ingest, build or update")
    task = asyncio.create_task(_spawn(kind, season))
    _running.add(task)
    task.add_done_callback(_running.discard)
    return {"started": kind, "season": season}


@router.get("/health")
async def health():
    async with _db() as db:
        runs = await db.execute_fetchall(
            """SELECT kind, status, started_at, finished_at, rows_written, error FROM run
               WHERE run_id IN (SELECT max(run_id) FROM run GROUP BY kind)""")
        feeds = await db.execute_fetchall(
            "SELECT dataset, season, upstream_version, pulled_at, schema_ok, rows FROM source_stamp "
            "ORDER BY dataset, season")
        latest = await db.execute_fetchall(
            "SELECT season, max(week) AS week FROM metric_value "
            "WHERE season = (SELECT max(season) FROM metric_value)")
        unresolved = await db.execute_fetchall("SELECT count(*) AS n FROM xwalk_issue WHERE pid IS NULL")
    return {
        "runs": [dict(r) for r in runs],
        "feeds": [dict(r) for r in feeds],
        "latest": dict(latest[0]) if latest and latest[0]["season"] else None,
        "unlinked_ids": unresolved[0]["n"],
    }


_ID_COLUMN = {"sleeper": "sleeper_id", "espn": "espn_id", "gsis": "gsis_id"}


@router.get("/players/batch")
async def players_batch(ids: str, source: str = "sleeper", season: int | None = None, week: int | None = None):
    """Compact cards for a roster's worth of players, keyed by the caller's own IDs.
    Defaults to the latest week with metrics in the season (or the latest season)."""
    column = _ID_COLUMN.get(source)
    if not column:
        raise HTTPException(400, f"source must be one of {', '.join(_ID_COLUMN)}")
    wanted = [i for i in dict.fromkeys(ids.split(",")) if i][:200]

    async with _db() as db:
        if season is None:
            season = (await db.execute_fetchall("SELECT max(season) AS s FROM metric_value"))[0]["s"]
        if week is None:
            week = (await db.execute_fetchall(
                "SELECT max(week) AS w FROM metric_value WHERE season = ?", (season,)))[0]["w"]
        as_of = (await db.execute_fetchall(
            "SELECT max(finished_at) AS t FROM run WHERE status IN ('ok','partial') AND rows_written > 0"))[0]["t"]
        if not wanted or week is None:
            return {"season": season, "week": week, "as_of": as_of, "players": {}}

        marks = ",".join("?" * len(wanted))
        players = await db.execute_fetchall(
            f"SELECT pid, {column} AS ext, name, position, pos_group FROM player WHERE {column} IN ({marks})",
            wanted)
        by_pid = {}
        for p in players:
            by_pid.setdefault(p["pid"], p)
        rows = await db.execute_fetchall(
            f"""SELECT v.subject, m.key, v.win, v.value, v.n, v.pct
                FROM metric_value v JOIN metric m ON m.mid = v.mid
                WHERE v.season = ? AND v.week = ? AND v.subject IN ({','.join('?' * len(by_pid))})""",
            [season, week, *by_pid]) if by_pid else []

    cards = {
        p["ext"]: {"pid": pid, "name": p["name"], "position": p["position"],
                   "pos_group": p["pos_group"], "metrics": {}}
        for pid, p in by_pid.items()
    }
    ext = {pid: p["ext"] for pid, p in by_pid.items()}
    for r in rows:
        windows = cards[ext[r["subject"]]]["metrics"].setdefault(r["key"], {})
        windows[WINDOWS[r["win"]]] = {"value": r["value"], "n": r["n"], "pct": r["pct"]}
    return {"season": season, "week": week, "as_of": as_of, "players": cards}
