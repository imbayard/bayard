"""L2 metrics: the registry and the runner.

Adding a metric is one decorated function in a family module (see usage.py). The runner does
the rest — windows, shrinkage, percentiles, upsert — and the `metric` row is synced from the
decorator, so there's no migration. Shrinkage needs the calibrate run's `yoy_r` / `shrink_k`
(see calibrate.py); until a metric has them, `value_shrunk` stays NULL.
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
# A season this short says little about the player: calibrate samples and shrinkage priors
# only count seasons of at least this many games.
MIN_GAMES = 6
# Caps the 1/(1 − r²) prior tightening in _shrink at ~5×, so one very stable metric can't
# freeze a player at last season's number.
R_MAX = 0.9


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


def _shrink(df: pl.DataFrame, prior: pl.DataFrame | None, groups: pl.DataFrame,
            cal: pl.DataFrame) -> pl.DataFrame:
    """value_shrunk = (n·x + k·μ) / (n + k). μ is last season's position-group mean m, moved
    toward the player's own last season by yoy_r: μ = m + r·(last − m), the prediction yoy_r
    was measured for. Knowing last season explains r² of the spread between players, so that
    prior is tighter and k grows by 1 / (1 − r²). No last season on file (2016, the first of the
    history) → no shrinkage."""
    if prior is None or cal.height == 0:
        return df.with_columns(value_shrunk=pl.lit(None, pl.Float64))
    last = prior.join(groups, on="pid").filter(pl.col("n") >= MIN_GAMES)
    means = last.group_by("mid", "pos_group").agg(m=pl.col("value").mean())
    own = (last.join(means, on=["mid", "pos_group"]).join(cal, on="mid")
           .select("pid", "mid", mu=pl.col("m") + pl.col("r") * (pl.col("value") - pl.col("m")),
                   k_own=pl.col("k") / (1 - pl.col("r").clip(0, R_MAX) ** 2)))
    return (
        df.join(means, on=["mid", "pos_group"], how="left")
        .join(own, on=["pid", "mid"], how="left")
        .join(cal, on="mid", how="left")
        # The `prior` window is last season itself, so it shrinks toward the plain mean.
        .with_columns(
            mu=pl.when(pl.col("win") == 3).then("m").otherwise(pl.coalesce("mu", "m")),
            k=pl.when(pl.col("win") == 3).then("k").otherwise(pl.coalesce("k_own", "k")),
        )
        .with_columns(value_shrunk=(pl.col("n") * pl.col("value") + pl.col("k") * pl.col("mu"))
                      / (pl.col("n") + pl.col("k")))
        .drop("m", "mu", "r", "k", "k_own")
    )


def compute(db: sqlite3.Connection, season: int, pg: pl.DataFrame, prior_pg: pl.DataFrame | None,
            groups: pl.DataFrame, closed: bool = False) -> int:
    """Rebuild every (week, window) for the season and replace its metric_value partition.
    `groups` is [pid, pos_group], the percentile peer groups. A closed season keeps only the
    week and season-to-date windows: history feeds calibration, not cards. Returns rows
    written."""
    mids = sync_registry(db)
    cal = pl.DataFrame(
        db.execute("SELECT mid, yoy_r, shrink_k FROM metric WHERE shrink_k IS NOT NULL").fetchall(),
        schema={"mid": pl.Int64, "r": pl.Float64, "k": pl.Float64}, orient="row",
    )
    long = _long(pg, mids)
    prior = _agg(_long(prior_pg, mids), 3) if prior_pg is not None else None

    frames = []
    for week in sorted(long["week"].unique().to_list()):
        upto = long.filter(pl.col("week") <= week)
        season_to_date = _agg(upto, 2)
        parts = [_agg(upto.filter(pl.col("week") == week), 0), season_to_date]
        if not closed:
            parts.append(_agg(upto.sort("week").group_by("pid", "mid").tail(LAST_N), 1))
            if prior is not None:
                parts.append(prior.join(season_to_date.select("pid", "mid"), on=["pid", "mid"]))
        frames.append(pl.concat(parts).with_columns(week=pl.lit(week, pl.Int64)))
    if not frames:
        return 0

    # Percentile within position group, on the shrunk value where there is one, among players
    # with at least half the window's biggest sample — so a two-snap cameo doesn't top the
    # target-share board.
    part = ["week", "mid", "win", "pos_group"]
    out = (
        _shrink(pl.concat(frames).join(groups, on="pid", how="left"), prior, groups, cal)
        .with_columns(eligible=pl.col("n") >= 0.5 * pl.col("n").max().over(part))
        .with_columns(
            pct=pl.when(pl.col("eligible")).then(
                (pl.coalesce("value_shrunk", "value").rank("average").over(part + ["eligible"])
                 / pl.len().over(part + ["eligible"]) * 100).round(1)
            )
        )
        .select(
            pl.col("pid").alias("subject"), pl.lit(season, pl.Int64).alias("season"), "week", "mid", "win",
            "value", "value_shrunk", "pct", "n",
        )
    )
    db.execute("DELETE FROM metric_value WHERE season = ?", (season,))
    db.executemany("INSERT INTO metric_value VALUES (?,?,?,?,?,?,?,?,?)", out.rows())
    return out.height
