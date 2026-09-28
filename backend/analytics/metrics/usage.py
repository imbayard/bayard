"""M1 usage & opportunity. The most stable thing we measure (target/carry share repeat at
r ≈ 0.57–0.67; see Signal Reliability), so these drive flags straight away.

Every metric is a ratio of sums over the games in a window: the function returns one row per
player-game with a numerator and a denominator, and the runner sums them per window. Shares
put team volume in the denominator; per-game rates put 1 there.
"""

import polars as pl

from . import metric


@metric("off_snap_pct", pos_groups="QB RB WR TE OL", label="Offensive snap share", uom="pct")
def off_snap_pct(pg: pl.DataFrame) -> pl.DataFrame:
    return pg.filter(pl.col("team_off_snaps") > 0).select(
        "pid", "week", num="off_snaps", den="team_off_snaps")


@metric("def_snap_pct", pos_groups="DL LB DB", label="Defensive snap share", uom="pct")
def def_snap_pct(pg: pl.DataFrame) -> pl.DataFrame:
    return pg.filter(pl.col("team_def_snaps") > 0).select(
        "pid", "week", num="def_snaps", den="team_def_snaps")


@metric("target_share", pos_groups="RB WR TE", label="Target share", uom="pct")
def target_share(pg: pl.DataFrame) -> pl.DataFrame:
    return pg.filter(pl.col("team_targets") > 0).select(
        "pid", "week", num="targets", den="team_targets")


@metric("air_yards_share", pos_groups="WR TE", label="Air-yard share", uom="pct")
def air_yards_share(pg: pl.DataFrame) -> pl.DataFrame:
    return pg.filter(pl.col("team_air_yards") > 0).select(
        "pid", "week", num="air_yards", den="team_air_yards")


@metric("carry_share", pos_groups="QB RB", label="Carry share", uom="pct")
def carry_share(pg: pl.DataFrame) -> pl.DataFrame:
    return pg.filter(pl.col("team_carries") > 0).select(
        "pid", "week", num="carries", den="team_carries")


def _per_game(col: str | pl.Expr):
    return lambda pg: pg.select("pid", "week", num=col, den=pl.lit(1.0))


metric("targets_pg", pos_groups="RB WR TE", label="Targets per game", uom="count")(_per_game("targets"))
metric("carries_pg", pos_groups="QB RB", label="Carries per game", uom="count")(_per_game("carries"))
metric("touches_pg", pos_groups="RB WR TE", label="Touches per game", uom="count")(
    _per_game(pl.col("carries") + pl.col("receptions")))
metric("pass_att_pg", pos_groups="QB", label="Pass attempts per game", uom="count")(_per_game("attempts"))
metric("ppr_pg", pos_groups="QB RB WR TE", label="PPR points per game", uom="pts")(_per_game("ppr"))
