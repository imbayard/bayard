"""Runner: `python -m backend.analytics.run <kind> [--season N]`.

Always a subprocess of the web service (or a shell), never imported by it — polars loads
here and exits with the run, so the always-on process's memory stays flat.

Kinds:
  ingest  pull whatever changed upstream
  build   rebuild L1 + metrics for the in-scope seasons (or one, with --season)
  update  ingest, then build if anything changed — what the hourly schedule runs

A build replaces each season's partitions in one transaction, so any run can be replayed and
a stat correction is just the next update.
"""

import argparse
import datetime as dt
import json
import logging
import subprocess
import sys
from contextlib import closing

from .db import connect, create_tables

log = logging.getLogger("backend.analytics")

LOCK_MINUTES = 30


def current_season(today: dt.date | None = None) -> int:
    """NFL seasons are named for the year they start; before June it's still last season."""
    today = today or dt.date.today()
    return today.year if today.month >= 6 else today.year - 1


def seasons_in_scope() -> list[int]:
    # Slice 1 keeps the current season plus one prior (the `prior` window). The 2016+
    # backfill arrives with calibrate in slice 2.
    s = current_season()
    return [s - 1, s]


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _code_version() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _acquire(db, kind: str, season: int | None) -> int | None:
    """The run table is the lock: one pipeline run at a time. A `running` row older than
    LOCK_MINUTES is a crashed run — mark it failed and take over."""
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=LOCK_MINUTES)).isoformat(timespec="seconds")
    with db:
        db.execute("UPDATE run SET status='failed', error='stale lock', finished_at=? "
                   "WHERE status='running' AND started_at < ?", (_now(), cutoff))
        if db.execute("SELECT 1 FROM run WHERE status='running'").fetchone():
            return None
        cur = db.execute("INSERT INTO run (kind, season, status, started_at, code_version) "
                         "VALUES (?, ?, 'running', ?, ?)", (kind, season, _now(), _code_version()))
        return cur.lastrowid


def build(db, seasons: list[int]) -> int:
    from . import core, metrics
    import polars as pl

    written = 0
    with db:
        core.load_players(db, seasons_in_scope())
    ids = core.player_ids(db)
    groups = ids.select("pid", "pos_group")
    frames: dict[int, pl.DataFrame] = {}
    # Each season's `prior` window needs last season's player-games loaded too.
    priors = {s - 1 for s in seasons} & set(seasons_in_scope())
    for season in sorted(set(seasons) | priors):
        with db:  # one transaction per season: readers never see half a rebuild
            core.load_games(db, season, ids)
            frames[season] = core.load_player_games(db, season, ids)
            if season in seasons:
                written += metrics.compute(db, season, frames[season], frames.get(season - 1), groups)
    return written


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="backend.analytics.run")
    p.add_argument("kind", choices=["ingest", "build", "update"])
    p.add_argument("--season", type=int)
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # signed download URLs, one per line

    create_tables()
    with closing(connect()) as db:
        run_id = _acquire(db, args.kind, args.season)
        if run_id is None:
            log.info("another run is in progress; exiting")
            return 0

        status, error, rows, stamps = "ok", None, 0, None
        try:
            seasons = [args.season] if args.season else seasons_in_scope()
            if args.kind in ("ingest", "update"):
                from .sources import ingest
                result = ingest(db, seasons_in_scope())
                stamps = json.dumps(result)
                if result["failed"]:
                    status = "partial"
                log.info("ingest: %s", result)
            if args.kind == "build" or (args.kind == "update" and json.loads(stamps)["changed"]):
                rows = build(db, seasons)
                log.info("build %s: %d metric rows", seasons, rows)
        except Exception as e:  # recorded on the run row; health surfaces it
            log.exception("run failed")
            status, error = "failed", f"{type(e).__name__}: {e}"

        with db:
            db.execute("UPDATE run SET status=?, finished_at=?, rows_written=?, source_stamps=?, error=? "
                       "WHERE run_id=?", (status, _now(), rows, stamps, error, run_id))
        return 0 if status != "failed" else 1


if __name__ == "__main__":
    sys.exit(main())
