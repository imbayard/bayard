"""L2 metrics: the registry and the runner.

Adding a metric is one decorated function in a family module (see usage.py). The runner does
the rest — windows, percentiles, upsert — and the `metric` row is synced from the decorator,
so there's no migration. Shrinkage waits for the calibrate run (slice 2): until a metric has a
measured `yoy_r`, `value_shrunk` stays NULL.
"""

import sqlite3
from dataclasses import dataclass
from typing import Callable

import polars as pl


@dataclass(frozen=True)
class Spec:
    key: str
    fn: Callable[[pl.DataFrame], pl.DataFrame]  # player-game frame -> [pid, week, num, den]
    pos_groups: str
    label: str
    uom: str
    family: str
    higher_is_better: int = 1


REGISTRY: dict[str, Spec] = {}

LAST_N = 4


def metric(key: str, *, pos_groups: str, label: str, uom: str, family: str = "usage", higher_is_better: int = 1):
    def register(fn):
        REGISTRY[key] = Spec(key, fn, pos_groups, label, uom, family, higher_is_better)
        return fn
    return register


from . import usage  # noqa: E402,F401  (registers on import)


def sync_registry(db: sqlite3.Connection) -> dict[str, int]:
    """Upsert a `metric` row per registered spec; returns key -> mid. Measured fields
    (yoy_r, shrink_k, validated_on) belong to calibrate and are left alone."""
    db.executemany(
        """INSERT INTO metric (key, scope, pos_groups, family, label, uom, higher_is_better,
                               in_season, source)
           VALUES (?, 'player', ?, ?, ?, ?, ?, 1, 'nflverse')
           ON CONFLICT (key) DO UPDATE SET pos_groups=excluded.pos_groups, family=excluded.family,
             label=excluded.label, uom=excluded.uom, higher_is_better=excluded.higher_is_better""",
        [(s.key, s.pos_groups, s.family, s.label, s.uom, s.higher_is_better) for s in REGISTRY.values()],
    )
    return dict(db.execute("SELECT key, mid FROM metric").fetchall())


def _long(pg: pl.DataFrame, mids: dict[str, int]) -> pl.DataFrame:
    """Every metric's per-game num/den, stacked, restricted to the metric's position groups."""
    parts = []
    for spec in REGISTRY.values():
        groups = spec.pos_groups.split()
        rows = spec.fn(pg.filter(pl.col("pos_group").is_in(groups)))
        parts.append(rows.select(
            pl.col("pid").cast(pl.Int64), pl.col("week").cast(pl.Int64),
            pl.col("num").cast(pl.Float64), pl.col("den").cast(pl.Float64),
            mid=pl.lit(mids[spec.key], pl.Int64),
        ))
    return pl.concat(parts)


def _agg(df: pl.DataFrame, win: int) -> pl.DataFrame:
    return df.group_by("pid", "mid").agg(
        (pl.col("num").sum() / pl.col("den").sum()).alias("value"),
        pl.len().cast(pl.Float64).alias("n"),
    ).with_columns(win=pl.lit(win, pl.Int64))


def compute(db: sqlite3.Connection, season: int, pg: pl.DataFrame, prior_pg: pl.DataFrame | None,
            groups: pl.DataFrame) -> int:
    """Rebuild every (week, window) for the season and replace its metric_value partition.
    `groups` is [pid, pos_group], the percentile peer groups. Returns rows written."""
    mids = sync_registry(db)
    long = _long(pg, mids)
    prior = _agg(_long(prior_pg, mids), 3) if prior_pg is not None else None

    frames = []
    for week in sorted(long["week"].unique().to_list()):
        upto = long.filter(pl.col("week") <= week)
        season_to_date = _agg(upto, 2)
        parts = [
            _agg(upto.filter(pl.col("week") == week), 0),
            _agg(upto.sort("week").group_by("pid", "mid").tail(LAST_N), 1),
            season_to_date,
        ]
        if prior is not None:
            parts.append(prior.join(season_to_date.select("pid", "mid"), on=["pid", "mid"]))
        frames.append(pl.concat(parts).with_columns(week=pl.lit(week, pl.Int64)))
    if not frames:
        return 0

    # Percentile within position group, among players with at least half the window's
    # biggest sample — so a two-snap cameo doesn't top the target-share board.
    part = ["week", "mid", "win", "pos_group"]
    out = (
        pl.concat(frames)
        .join(groups, on="pid", how="left")
        .with_columns(eligible=pl.col("n") >= 0.5 * pl.col("n").max().over(part))
        .with_columns(
            pct=pl.when(pl.col("eligible")).then(
                (pl.col("value").rank("average").over(part + ["eligible"])
                 / pl.len().over(part + ["eligible"]) * 100).round(1)
            )
        )
        .select(
            pl.col("pid").alias("subject"), pl.lit(season, pl.Int64).alias("season"), "week", "mid", "win",
            "value", pl.lit(None, pl.Float64).alias("value_shrunk"), "pct", "n",
        )
    )
    db.execute("DELETE FROM metric_value WHERE season = ?", (season,))
    db.executemany("INSERT INTO metric_value VALUES (?,?,?,?,?,?,?,?,?)", out.rows())
    return out.height
