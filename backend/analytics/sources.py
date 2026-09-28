"""L0 ingest: poll upstream, download only what changed, check the schema contract, and
record a source_stamp per file. Runs in the runner subprocess (imports polars).

Release assets are polled through the GitHub releases API (one call per tag, well under the
60/hr anonymous limit); plain files use an ETag, so an unchanged file costs a 304.
"""

import datetime as dt
import hashlib
import logging
import sqlite3
from dataclasses import dataclass

import httpx
import polars as pl

from .db import RAW_DIR

log = logging.getLogger(__name__)

RELEASES = "https://api.github.com/repos/nflverse/nflverse-data/releases/tags/{tag}"


@dataclass(frozen=True)
class Feed:
    name: str
    columns: tuple[str, ...]  # schema contract: must all be present
    tag: str | None = None  # nflverse-data release tag
    asset: str | None = None  # asset name; "{season}" makes the feed seasonal
    url: str | None = None  # plain file (not a release asset)

    @property
    def seasonal(self) -> bool:
        return "{season}" in (self.asset or self.url or "")

    @property
    def ext(self) -> str:
        return (self.asset or self.url or "").rsplit(".", 1)[-1]


FEEDS = [
    Feed(
        "players",
        ("gsis_id", "display_name", "position", "position_group", "pfr_id", "espn_id",
         "birth_date", "rookie_season", "draft_pick"),
        tag="players", asset="players.parquet",
    ),
    Feed(
        "ff_playerids",
        ("gsis_id", "sleeper_id", "espn_id", "pfr_id"),
        url="https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv",
    ),
    Feed(
        "rosters_weekly",
        ("season", "week", "team", "position", "full_name", "gsis_id", "pfr_id", "sleeper_id",
         "espn_id"),
        tag="weekly_rosters", asset="roster_weekly_{season}.parquet",
    ),
    Feed(
        "snap_counts",
        ("game_id", "season", "game_type", "week", "player", "pfr_player_id", "position", "team",
         "offense_snaps", "offense_pct", "defense_snaps", "defense_pct", "st_pct"),
        tag="snap_counts", asset="snap_counts_{season}.parquet",
    ),
    Feed(
        "player_stats",
        ("player_id", "season", "week", "season_type", "game_id", "team", "attempts", "targets",
         "receptions", "carries", "receiving_air_yards", "fantasy_points_ppr"),
        tag="stats_player", asset="stats_player_week_{season}.parquet",
    ),
    Feed(
        "schedules",
        ("game_id", "season", "game_type", "week", "gameday", "gametime", "home_team",
         "away_team", "spread_line", "total_line", "home_qb_id", "away_qb_id"),
        url="https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
    ),
]


def raw_path(feed: Feed, season: int):
    return RAW_DIR / feed.name / f"{season if feed.seasonal else 'all'}.{feed.ext}"


def read_raw(name: str, season: int = 0) -> pl.DataFrame:
    feed = next(f for f in FEEDS if f.name == name)
    path = raw_path(feed, season)
    if feed.ext == "csv":
        # Everything as text, then cast where used: these CSVs mix "NA" into numeric columns.
        return pl.read_csv(path, infer_schema_length=0, null_values=["NA", ""])
    return pl.read_parquet(path)


def _check_contract(feed: Feed, path) -> tuple[bool, int]:
    df = pl.read_csv(path, infer_schema_length=0) if feed.ext == "csv" else pl.read_parquet(path)
    missing = [c for c in feed.columns if c not in df.columns]
    if missing:
        log.error("%s: schema contract failed, missing %s", feed.name, missing)
    return not missing, df.height


def ingest(db: sqlite3.Connection, seasons: list[int]) -> dict:
    """Pull every feed that changed upstream. Returns {"changed": [...], "failed": [...]}.
    A failed feed keeps its last-good file, so downstream builds go stale rather than wrong."""
    changed, failed = [], []
    stamps = {
        (d, s): v
        for d, s, v in db.execute("SELECT dataset, season, upstream_version FROM source_stamp")
    }
    releases: dict[str, dict] = {}

    with httpx.Client(timeout=120, follow_redirects=True) as http:
        for feed in FEEDS:
            for season in seasons if feed.seasonal else [0]:
                key = (feed.name, season)
                try:
                    if feed.tag:
                        if feed.tag not in releases:
                            r = http.get(RELEASES.format(tag=feed.tag))
                            r.raise_for_status()
                            releases[feed.tag] = {a["name"]: a for a in r.json()["assets"]}
                        asset = releases[feed.tag].get(feed.asset.format(season=season))
                        if asset is None:
                            continue  # season not published yet
                        version = asset["updated_at"]
                        if stamps.get(key) == version and raw_path(feed, season).exists():
                            continue
                        r = http.get(asset["browser_download_url"])
                    else:
                        headers = {}
                        if stamps.get(key) and raw_path(feed, season).exists():
                            headers["If-None-Match"] = stamps[key]
                        r = http.get(feed.url, headers=headers)
                        if r.status_code == 304:
                            continue
                        version = r.headers.get("etag")
                    r.raise_for_status()
                except httpx.HTTPError as e:
                    log.error("%s %s: download failed: %s", feed.name, season, e)
                    failed.append(f"{feed.name}:{season}")
                    continue

                path = raw_path(feed, season)
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix(".tmp")
                tmp.write_bytes(r.content)
                ok, rows = _check_contract(feed, tmp)
                if ok:
                    tmp.replace(path)
                    changed.append(f"{feed.name}:{season}")
                else:
                    tmp.unlink()
                    failed.append(f"{feed.name}:{season}")
                db.execute(
                    """INSERT INTO source_stamp VALUES (?,?,?,?,?,?,?)
                       ON CONFLICT (dataset, season) DO UPDATE SET
                         upstream_version = CASE WHEN excluded.schema_ok THEN excluded.upstream_version ELSE upstream_version END,
                         sha256 = CASE WHEN excluded.schema_ok THEN excluded.sha256 ELSE sha256 END,
                         rows = CASE WHEN excluded.schema_ok THEN excluded.rows ELSE rows END,
                         schema_ok = excluded.schema_ok, pulled_at = excluded.pulled_at""",
                    (feed.name, season, version, hashlib.sha256(r.content).hexdigest(), rows,
                     int(ok), dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")),
                )
                db.commit()

    return {"changed": changed, "failed": failed}
