"""Runner: `python -m backend.analytics.run <kind> [--season N]`.

Always a subprocess of the web service (or a shell), never imported by it — polars loads
here and exits with the run, so the always-on process's memory stays flat.

Kinds:
  ingest     pull whatever changed upstream
  build      rebuild L1 + metrics for the in-scope seasons (or one, with --season)
  update     ingest, then build if anything changed — what the hourly schedule runs
  calibrate  measure yoy_r / shrink_k from the closed seasons on file, then rebuild so values
             pick up the new shrinkage (in-scope seasons, or one, with --season)
  backfill   once: ingest + build every season since HISTORY_START, calibrate, rebuild all

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
HISTORY_START = 2016  # first season with participation and NGS; calibration history starts here


def current_season(today: dt.date | None = None) -> int:
    """NFL seasons are named for the year they start; before June it's still last season."""
    today = today or dt.date.today()
    return today.year if today.month >= 6 else today.year - 1


def seasons_in_scope() -> list[int]:
    # What the hourly update keeps fresh: the current season plus the one its `prior` window
    # and shrinkage priors read. Older seasons are history, written once by `backfill`.
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
    from .sources import raw_seasons

    written = 0
    on_disk = set(raw_seasons("snap_counts"))
    with db:
        core.load_players(db, raw_seasons("rosters_weekly"))
    ids = core.player_ids(db)
    groups = ids.select("pid", "pos_group")

    def load(season):
        core.load_games(db, season, ids)
        return core.load_player_games(db, season, ids)

    # Oldest first, carrying only last season's frame: a ten-season backfill holds two seasons
    # in memory, not ten. Each season's `prior` window and shrinkage prior read that frame.
    prev_season, prev = None, None
    for season in sorted(seasons):
        with db:  # one transaction per season: readers never see half a rebuild
            if prev_season != season - 1:
                prev = load(season - 1) if season - 1 in on_disk else None
            frame = load(season)
            written += metrics.compute(db, season, frame, prev, groups, closed=season < current_season())
        prev_season, prev = season, frame
    return written


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="backend.analytics.run")
    p.add_argument("kind", choices=["ingest", "build", "update", "calibrate", "backfill"])
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
            if args.kind == "backfill":
                from .sources import ingest
                seasons = list(range(HISTORY_START, current_season() + 1))
                result = ingest(db, seasons)
                stamps = json.dumps(result)
                if result["failed"]:
                    status = "partial"
                log.info("ingest %d-%d: %d changed, failed %s", seasons[0], seasons[-1],
                         len(result["changed"]), result["failed"])
                build(db, seasons)  # raw values; calibrate reads them
            if args.kind in ("calibrate", "backfill"):
                from .calibrate import calibrate
                with db:
                    fit = calibrate(db, list(range(HISTORY_START, current_season())))
                for key, f in fit.items():
                    log.info("calibrate %-16s yoy_r=%.3f split-half=%.3f k=%.2f (%d players)", key,
                             f["r"], f["rho"], f["k"], f["players"])
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
