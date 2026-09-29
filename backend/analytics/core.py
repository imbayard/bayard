"""L1 core: the ID crosswalk, games, and who-played-how-much. Runner subprocess only.

`pid` is stable across rebuilds — keyed on gsis_id and only ever inserted or updated — so
metric rows written in earlier seasons keep pointing at the right human.
"""

import datetime as dt
import re
import sqlite3

import polars as pl

from .sources import read_raw

POS_GROUP = {
    "QB": "QB",
    "RB": "RB", "HB": "RB", "FB": "RB",
    "WR": "WR",
    "TE": "TE",
    "T": "OL", "OT": "OL", "G": "OL", "OG": "OL", "C": "OL", "OC": "OL", "OL": "OL",
    "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL",
    "LB": "LB", "ILB": "LB", "OLB": "LB", "MLB": "LB",
    "CB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "SAF": "DB", "DB": "DB",
    "K": "K", "P": "P", "LS": "LS",
}

_SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b")


def _norm_name(expr: pl.Expr) -> pl.Expr:
    return (
        expr.str.to_lowercase()
        .str.replace_all(r"[^a-z ]", "")
        .str.replace_all(_SUFFIX.pattern, "")
        .str.replace_all(r"\s+", " ")
        .str.strip_chars()
    )


def _pos_group(expr: pl.Expr) -> pl.Expr:
    return expr.replace_strict(POS_GROUP, default=None)


def load_players(db: sqlite3.Connection, seasons: list[int]) -> int:
    """Upsert `player` from nflverse's player master, filling platform IDs from the
    DynastyProcess crosswalk and weekly rosters. Returns rows upserted."""
    players = read_raw("players").filter(pl.col("gsis_id").is_not_null())
    ff = read_raw("ff_playerids").filter(pl.col("gsis_id").is_not_null()).unique("gsis_id")
    rosters = pl.concat(
        [read_raw("rosters_weekly", s).select("gsis_id", "sleeper_id", "espn_id", "pfr_id", "week", "season")
         .with_columns(pl.col("sleeper_id", "espn_id", "pfr_id").cast(pl.Utf8))
         for s in seasons],
        how="vertical_relaxed",  # older seasons store some columns at other int widths
    ).filter(pl.col("gsis_id").is_not_null()).sort("season", "week").unique("gsis_id", keep="last")

    df = (
        players.join(ff.select("gsis_id", pl.col("sleeper_id").alias("ff_sleeper"),
                               pl.col("espn_id").alias("ff_espn"), pl.col("pfr_id").alias("ff_pfr")),
                     on="gsis_id", how="left")
        .join(rosters.select("gsis_id", pl.col("sleeper_id").alias("r_sleeper"),
                             pl.col("espn_id").alias("r_espn"), pl.col("pfr_id").alias("r_pfr")),
              on="gsis_id", how="left")
        .select(
            "gsis_id",
            pl.coalesce("pfr_id", "r_pfr", "ff_pfr").alias("pfr_id"),
            pl.coalesce("r_sleeper", "ff_sleeper").alias("sleeper_id"),
            pl.coalesce(pl.col("espn_id").cast(pl.Utf8), "r_espn", "ff_espn").alias("espn_id"),
            pl.col("display_name").alias("name"),
            "position",
            pl.coalesce(_pos_group(pl.col("position")), pl.col("position_group")).alias("pos_group"),
            pl.col("birth_date").cast(pl.Utf8),
            pl.col("rookie_season").cast(pl.Int64).alias("entry_year"),
            pl.col("draft_pick").cast(pl.Int64),
        )
    )
    db.executemany(
        """INSERT INTO player (gsis_id, pfr_id, sleeper_id, espn_id, name, position, pos_group,
                               birth_date, entry_year, draft_pick)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT (gsis_id) DO UPDATE SET
             pfr_id=excluded.pfr_id, sleeper_id=excluded.sleeper_id, espn_id=excluded.espn_id,
             name=excluded.name, position=excluded.position, pos_group=excluded.pos_group,
             birth_date=excluded.birth_date, entry_year=excluded.entry_year,
             draft_pick=excluded.draft_pick""",
        df.rows(),
    )
    return df.height


def player_ids(db: sqlite3.Connection) -> pl.DataFrame:
    return pl.DataFrame(
        db.execute("SELECT pid, gsis_id, pfr_id, pos_group FROM player").fetchall(),
        schema={"pid": pl.Int64, "gsis_id": pl.Utf8, "pfr_id": pl.Utf8, "pos_group": pl.Utf8},
        orient="row",
    )


def load_games(db: sqlite3.Connection, season: int, ids: pl.DataFrame) -> None:
    g = read_raw("schedules").filter(pl.col("season") == str(season))
    qb = ids.select("gsis_id", "pid")
    g = (
        g.join(qb.rename({"gsis_id": "home_qb_id", "pid": "home_qb_pid"}), on="home_qb_id", how="left")
        .join(qb.rename({"gsis_id": "away_qb_id", "pid": "away_qb_pid"}), on="away_qb_id", how="left")
        .select(
            "game_id", pl.col("season").cast(pl.Int64), pl.col("week").cast(pl.Int64), "game_type",
            (pl.col("gameday") + "T" + pl.col("gametime")).alias("kickoff"),  # US/Eastern
            pl.col("home_team").alias("home"), pl.col("away_team").alias("away"),
            pl.col("spread_line").cast(pl.Float64).alias("spread"),
            pl.col("total_line").cast(pl.Float64).alias("total"),
            pl.col("home_moneyline").cast(pl.Int64).alias("home_ml"),
            pl.col("away_moneyline").cast(pl.Int64).alias("away_ml"),
            "roof", "surface",
            pl.col("home_rest").cast(pl.Int64), pl.col("away_rest").cast(pl.Int64),
            "home_qb_pid", "away_qb_pid",
            pl.col("home_score").cast(pl.Int64), pl.col("away_score").cast(pl.Int64),
        )
    )
    db.execute("DELETE FROM game WHERE season = ?", (season,))
    db.executemany(f"INSERT INTO game VALUES ({','.join('?' * g.width)})", g.rows())


def _link_snaps(db: sqlite3.Connection, snaps: pl.DataFrame, season: int, ids: pl.DataFrame) -> pl.DataFrame:
    """pfr_player_id → pid. Exact first; the rest by normalized name + team + position group
    against that season's weekly rosters. Anything still unlinked lands in xwalk_issue."""
    exact = snaps.join(ids.select("pfr_id", "pid").filter(pl.col("pfr_id").is_not_null()).unique("pfr_id"),
                       left_on="pfr_player_id", right_on="pfr_id", how="left")
    missing = (
        exact.filter(pl.col("pid").is_null())
        .unique("pfr_player_id")
        .select("pfr_player_id", "player", "team", "position",
                _norm_name(pl.col("player")).alias("nm"), _pos_group(pl.col("position")).alias("pg"))
    )
    if missing.height == 0:
        return exact

    rosters = (
        read_raw("rosters_weekly", season)
        .select(_norm_name(pl.col("full_name")).alias("nm"), "team",
                _pos_group(pl.col("position")).alias("pg"), "gsis_id")
        .filter(pl.col("gsis_id").is_not_null())
        .unique()
        .join(ids.select("gsis_id", "pid"), on="gsis_id")
    )
    matched = missing.join(rosters, on=["nm", "team", "pg"], how="left")
    # Two roster rows for one name/team/group (a father-son pair, a duplicate listing) is not a
    # match — leave it for a human, or for Jev in slice 5.
    ambiguous = matched.group_by("pfr_player_id").agg(pl.col("pid").n_unique().alias("k")).filter(pl.col("k") > 1)
    matched = matched.join(ambiguous, on="pfr_player_id", how="anti").unique("pfr_player_id")

    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    db.executemany(
        """INSERT INTO xwalk_issue VALUES ('pfr', ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (source, source_id) DO UPDATE SET
             pid = COALESCE(xwalk_issue.pid, excluded.pid),
             method = COALESCE(xwalk_issue.method, excluded.method),
             confidence = COALESCE(xwalk_issue.confidence, excluded.confidence),
             resolved_at = COALESCE(xwalk_issue.resolved_at, excluded.resolved_at)""",
        [
            (r["pfr_player_id"], r["player"], r["team"], r["position"], r["pid"],
             "name_team" if r["pid"] is not None else None,
             1.0 if r["pid"] is not None else None,
             now if r["pid"] is not None else None)
            for r in matched.iter_rows(named=True)
        ]
        + [
            (r["pfr_player_id"], r["player"], r["team"], r["position"], None, None, None, None)
            for r in missing.join(matched, on="pfr_player_id", how="anti").iter_rows(named=True)
        ],
    )
    # Resolutions from any method (including manual ones written straight into xwalk_issue).
    resolved = pl.DataFrame(
        db.execute("SELECT source_id, pid FROM xwalk_issue WHERE source = 'pfr' AND pid IS NOT NULL").fetchall(),
        schema={"pfr_player_id": pl.Utf8, "xpid": pl.Int64}, orient="row",
    )
    return (
        exact.join(resolved, on="pfr_player_id", how="left")
        .with_columns(pl.coalesce("pid", "xpid").alias("pid"))
        .drop("xpid")
    )


def load_player_games(db: sqlite3.Connection, season: int, ids: pl.DataFrame) -> pl.DataFrame:
    """Writes `player_game` for the season and returns the regular-season player-game frame
    the metric functions read: snaps joined to box-score stats, plus team totals per game."""
    snaps = read_raw("snap_counts", season).filter(pl.col("game_type") == "REG")
    snaps = _link_snaps(db, snaps, season, ids).filter(pl.col("pid").is_not_null())
    pg = snaps.select(
        "pid", "game_id", pl.col("season").cast(pl.Int64), pl.col("week").cast(pl.Int64), "team",
        pl.col("offense_snaps").cast(pl.Int64).alias("off_snaps"), pl.col("offense_pct").alias("off_pct"),
        pl.col("defense_snaps").cast(pl.Int64).alias("def_snaps"), pl.col("defense_pct").alias("def_pct"),
        "st_pct",
    ).unique(["pid", "game_id"])

    db.execute("DELETE FROM player_game WHERE season = ?", (season,))
    db.executemany(f"INSERT INTO player_game VALUES ({','.join('?' * pg.width)})", pg.rows())

    stats = (
        read_raw("player_stats", season)
        .filter(pl.col("season_type") == "REG")
        .join(ids.select("gsis_id", "pid"), left_on="player_id", right_on="gsis_id")
        .select("pid", "game_id", pl.col("week").cast(pl.Int64), "team", "attempts", "targets",
                "receptions", "carries", pl.col("receiving_air_yards").alias("air_yards"),
                pl.col("fantasy_points_ppr").alias("ppr"))
    )
    stat_cols = ["attempts", "targets", "receptions", "carries", "air_yards", "ppr"]
    # Team totals come from the box score (every player's stat line, snaps or not); team snaps
    # from any player's count / pct — the pct is of the team's snaps.
    team = stats.group_by("team", "game_id").agg(
        [pl.col(c).sum().alias(f"team_{c}") for c in ("targets", "carries", "air_yards")]
    )
    team_snaps = (
        pg.filter(pl.col("off_pct") > 0).group_by("team", "game_id")
        .agg((pl.col("off_snaps") / pl.col("off_pct")).round(0).max().alias("team_off_snaps"))
        .join(pg.filter(pl.col("def_pct") > 0).group_by("team", "game_id")
              .agg((pl.col("def_snaps") / pl.col("def_pct")).round(0).max().alias("team_def_snaps")),
              on=["team", "game_id"], how="full", coalesce=True)
    )
    frame = (
        pg.join(stats.drop("week"), on=["pid", "game_id"], how="full", coalesce=True)
        .with_columns(pl.coalesce("team", "team_right").alias("team"))
        .drop("team_right")
        .join(ids.select("pid", "pos_group"), on="pid", how="left")
        .join(team, on=["team", "game_id"], how="left")
        .join(team_snaps, on=["team", "game_id"], how="left")
        .with_columns(
            pl.col(stat_cols + ["off_snaps", "def_snaps"]).fill_null(0),
            # A stats-only row (no snap count) still needs a week.
            pl.col("game_id").str.slice(5, 2).cast(pl.Int64).alias("week"),
            pl.lit(season).alias("season"),
        )
    )
    return frame
