"""Calibrate v1: how much each metric repeats, and how noisy a small sample of it is.
Runner subprocess only (imports polars). Two measurements per metric, pooled over every
closed season on file, among players with MIN_GAMES+ games:

- yoy_r: a player's full-season value vs the same player's next season. Says how far last
  season predicts this one, so it sets the prior: μ = m + r·(last − m).
- shrink_k: from split-half reliability ρ (odd weeks vs even weeks of one season), in games:
  k = n̄·(1 − ρ) / ρ, where n̄ is the mean games per half. It says how noisy n games are,
  which yoy_r can't: yoy_r also counts real role changes between seasons, and a k built from
  it shrank a full season of WR1 snap share (83%) to 70%.

Values are centred on their (season, position group) mean first, so a metric shared by two
groups (carry share: QBs ~10%, RBs up to 70%) isn't credited with the gap between them.
Split halves average the per-game values (the runner's week window) rather than re-summing
num/den; for a reliability estimate the difference is noise.
"""

import datetime as dt
import sqlite3

import polars as pl

from .metrics import MIN_GAMES

# Fewer players than this and the correlation itself is noise; the metric stays uncalibrated.
MIN_PAIRS = 30
# Correlations at or below this are treated as no signal: k grows large and values shrink to μ.
R_FLOOR = 0.02


def _values(db: sqlite3.Connection, where: str, args: list) -> pl.DataFrame:
    return pl.DataFrame(
        db.execute(f"""SELECT v.subject, v.season, v.week, v.mid, v.value, v.n, p.pos_group
                       FROM metric_value v JOIN player p ON p.pid = v.subject WHERE {where}""", args).fetchall(),
        schema={"pid": pl.Int64, "season": pl.Int64, "week": pl.Int64, "mid": pl.Int64,
                "value": pl.Float64, "n": pl.Float64, "pos_group": pl.Utf8},
        orient="row",
    )


def _centre(col: str, *by: str) -> pl.Expr:
    return pl.col(col) - pl.col(col).mean().over("season", "mid", "pos_group", *by)


def calibrate(db: sqlite3.Connection, seasons: list[int]) -> dict[str, dict]:
    """Measure yoy_r and shrink_k over `seasons` (closed ones) and write them to `metric`.
    Returns {key: {r, rho, k, players}} for the log."""
    marks = ",".join("?" * len(seasons))
    final = dict(db.execute(
        f"SELECT season, max(week) FROM metric_value WHERE season IN ({marks}) GROUP BY season", seasons
    ).fetchall())
    if len(final) < 2:
        return {}

    # Year over year: final season-to-date values in consecutive seasons.
    full = _values(db, f"v.win = 2 AND v.n >= ? AND ({' OR '.join('(v.season = ? AND v.week = ?)' for _ in final)})",
                   [MIN_GAMES, *[x for s, w in final.items() for x in (s, w)]])
    full = full.with_columns(dev=_centre("value"))
    yoy = (
        full.join(full.select("pid", "mid", pl.col("season") - 1, pl.col("dev").alias("dev_next")),
                  on=["pid", "mid", "season"])
        .group_by("mid").agg(r=pl.corr("dev", "dev_next"), pairs=pl.len())
    )

    # Split half: odd vs even weeks inside each season, same qualifying players.
    weeks = (
        _values(db, f"v.win = 0 AND v.season IN ({','.join('?' * len(final))})", list(final))
        .join(full.select("pid", "season", "mid"), on=["pid", "season", "mid"])
        .group_by("pid", "season", "mid", "pos_group", half=pl.col("week") % 2)
        .agg(value=pl.col("value").mean(), n=pl.len())
    )
    weeks = weeks.with_columns(dev=_centre("value", "half"))
    split = (
        weeks.filter(pl.col("half") == 1)
        .join(weeks.filter(pl.col("half") == 0), on=["pid", "season", "mid"], suffix="_even")
        .group_by("mid")
        .agg(rho=pl.corr("dev", "dev_even"), players=pl.len(),
             n_half=((pl.col("n") + pl.col("n_even")) / 2).mean())
    )

    fit = (
        yoy.join(split, on="mid")
        .filter(pl.col("pairs") >= MIN_PAIRS, pl.col("players") >= MIN_PAIRS)
        .with_columns(rho=pl.col("rho").clip(R_FLOOR, 1))
        .with_columns(k=pl.col("n_half") * (1 - pl.col("rho")) / pl.col("rho"))
    )
    stamp = f"{dt.date.today().isoformat()} on {min(final)}-{max(final)}"
    db.executemany(
        "UPDATE metric SET yoy_r = ?, shrink_k = ?, min_sample = ?, validated_on = ? WHERE mid = ?",
        [(round(r["r"], 3), round(r["k"], 3), MIN_GAMES, stamp, r["mid"]) for r in fit.iter_rows(named=True)],
    )
    keys = dict(db.execute("SELECT mid, key FROM metric").fetchall())
    return {
        keys[r["mid"]]: {"r": round(r["r"], 3), "rho": round(r["rho"], 3), "k": round(r["k"], 2),
                         "players": r["players"]}
        for r in fit.sort("r", descending=True).iter_rows(named=True)
    }
