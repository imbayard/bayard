"""Coerce daily strain/recovery rows into the generic chart payload the UI renders.

The payload is deliberately provider-agnostic: `chart` describes the axes,
`series` describes how to draw each bar/line, and `points` carry plot-ready
numbers already scaled, rounded and formatted. A chart component reads those
three keys and knows nothing about WHOOP, so the next chart (sleep, weight,
workout zones) reuses it unchanged.

Pure functions only — rows come from backend.health.store.
"""

import datetime as dt

STRAIN_MAX = 21.0
RECOVERY_MAX = 100.0
# WHOOP reports day energy in kilojoules; the app (and everyone else) reads calories.
KJ_PER_CALORIE = 4.184
# Strain and recovery share one 0-100 axis: 7 strain reads as 33%, 14 as 66%,
# 21 as 100%. The frontend multiplies back by this to label a second axis.
STRAIN_SCALE = RECOVERY_MAX / STRAIN_MAX

BANDS = [
    {"label": "Low", "min": 0, "max": 33, "tone": "bad"},
    {"label": "Medium", "min": 34, "max": 66, "tone": "warn"},
    {"label": "High", "min": 67, "max": 100, "tone": "good"},
]

# Daily bars stop being readable somewhere past a quarter, so long ranges roll
# up. Thresholds are in days.
_BUCKET_THRESHOLDS = [(92, "day"), (400, "week")]
_TREND_WINDOW = {"day": 7, "week": 4, "month": 3}


def pick_bucket(span_days: int) -> str:
    for limit, bucket in _BUCKET_THRESHOLDS:
        if span_days <= limit:
            return bucket
    return "month"


def _band(recovery: float | None) -> str | None:
    if recovery is None:
        return None
    if recovery < 34:
        return "bad"
    if recovery < 67:
        return "warn"
    return "good"


def _trend(values: list[float | None], window: int) -> list[float | None]:
    """Centered rolling mean that steps over gaps rather than treating a missing
    day as a zero, which would drag the line down through every hole."""
    out: list[float | None] = []
    half = window // 2
    for i in range(len(values)):
        near = [v for v in values[max(0, i - half) : i + half + 1] if v is not None]
        out.append(round(sum(near) / len(near), 1) if near else None)
    return out


def _bucket_start(day: dt.date, bucket: str) -> dt.date:
    if bucket == "week":
        return day - dt.timedelta(days=day.weekday())
    if bucket == "month":
        return day.replace(day=1)
    return day


def _label(day: dt.date, bucket: str) -> str:
    if bucket == "month":
        return day.strftime("%b %Y")
    if bucket == "week":
        return day.strftime("%b %d")
    return day.strftime("%a %d")


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _stats(rows: list[dict], key: str, skip_partial: bool) -> tuple[float | None, float | None]:
    """Latest (most recent non-null) and mean.

    `skip_partial` applies to strain only: an unfinished cycle is still
    accumulating, so today's strain would drag the average down. Recovery is
    scored once at wake and is final the moment it exists, so today's counts.
    """
    values = [
        r[key] for r in rows
        if r.get(key) is not None and not (skip_partial and r.get("partial"))
    ]
    if not values:
        return None, None
    return values[-1], round(sum(values) / len(values), 1)


def _delta(now: float | None, before: float | None, digits: int = 0) -> str | None:
    if now is None or before is None:
        return None
    return f"{round(now - before, digits):+g}"


def build(
    rows: dict[dt.date, dict],
    start: float,
    end: float,
    previous: dict[dt.date, dict] | None = None,
    bucket: str = "auto",
) -> dict:
    """Chart payload for [start, end], both epoch seconds.

    `previous` is the equal-length window immediately before, used only for the
    summary deltas — the "+8 this week" figure, scoped to the range in view.
    """
    # A "last 7 days" call spans 7 buckets ending today, not 8 — the inclusive
    # date range between the two endpoints is one day wider than the span.
    span_days = max(1, round((end - start) / 86400))
    last_day = dt.date.fromtimestamp(end)
    days = [last_day - dt.timedelta(days=i) for i in range(span_days - 1, -1, -1)]

    if bucket == "auto":
        bucket = pick_bucket(span_days)

    # Group days into buckets, preserving order and keeping empty buckets so
    # gaps stay visible rather than silently closing up.
    buckets: dict[dt.date, list[dict]] = {}
    for day in days:
        buckets.setdefault(_bucket_start(day, bucket), []).append(rows.get(day, {}))

    points = []
    for bucket_day, members in buckets.items():
        # An open cycle's strain is included here even though it is still
        # climbing: the bar is how you see what you have spent against today's
        # recovery, and hiding it leaves today looking like a rest day. It is
        # flagged partial so the chart can render it as provisional, and the
        # summary averages still skip it.
        strains = [m["strain"] for m in members if m.get("strain") is not None]
        recoveries = [m["recovery"] for m in members if m.get("recovery") is not None]
        strain, recovery = _mean(strains), _mean(recoveries)
        points.append(
            {
                "x": int(dt.datetime.combine(bucket_day, dt.time()).timestamp()),
                "x_label": _label(bucket_day, bucket),
                "recovery": round(recovery) if recovery is not None else None,
                "recovery_label": f"{round(recovery)}%" if recovery is not None else None,
                "strain": round(strain * STRAIN_SCALE, 1) if strain is not None else None,
                "strain_label": f"{strain:.1f}" if strain is not None else None,
                "strain_raw": round(strain, 2) if strain is not None else None,
                "band": _band(recovery),
                "partial": any(m.get("partial") for m in members),
            }
        )

    # One trendline per bar series. Strain's is smoothed on the already-scaled
    # value so it plots against the same 0-100 axis as everything else.
    window = _TREND_WINDOW[bucket]
    for source in ("recovery", "strain"):
        for point, value in zip(points, _trend([p[source] for p in points], window)):
            point[f"{source}_trend"] = value
            # Label in the series' own units, so a strain trend reads "8.4"
            # rather than the 40.0 it plots at on the shared axis.
            if value is None:
                point[f"{source}_trend_label"] = None
            elif source == "strain":
                point[f"{source}_trend_label"] = f"{value / STRAIN_SCALE:.1f}"
            else:
                point[f"{source}_trend_label"] = f"{round(value)}%"

    # Summary reads the raw days, never the buckets. On a year view a bucket is
    # a weekly mean, so "Recovery" would report the average of the last week
    # (76%) rather than where you actually are today (87%) — and an average of
    # averages weights a 2-day week the same as a 7-day one.
    daily = [rows[d] for d in days if d in rows]
    previous_rows = list((previous or {}).values())
    _, avg_recovery = _stats(daily, "recovery", skip_partial=False)
    _, prev_avg_recovery = _stats(previous_rows, "recovery", skip_partial=False)
    _, avg_strain = _stats(daily, "strain", skip_partial=True)
    _, prev_avg_strain = _stats(previous_rows, "strain", skip_partial=True)
    # Calories ride the cycle score alongside strain, so an open cycle is still
    # counting them up — skip today for the same reason strain does.
    _, avg_kj = _stats(daily, "kilojoule", skip_partial=True)
    _, prev_avg_kj = _stats(previous_rows, "kilojoule", skip_partial=True)
    avg_calories = avg_kj / KJ_PER_CALORIE if avg_kj is not None else None
    prev_avg_calories = (
        prev_avg_kj / KJ_PER_CALORIE if prev_avg_kj is not None else None
    )

    return {
        "chart": {
            "type": "bar",
            "title": "Strain & Recovery",
            "x_label": "Date",
            "value_label": "Recovery %",
            "value_min": 0,
            "value_max": 100,
            "bucket": bucket,
        },
        "series": [
            {
                "key": "recovery",
                "label": "Recovery",
                "render": "bar",
                "unit": "%",
                "value_min": 0,
                "value_max": 100,
                "bands": BANDS,
            },
            {
                "key": "strain",
                "label": "Strain",
                "render": "bar",
                "value_min": 0,
                "value_max": STRAIN_MAX,
                "scale_to_value": round(STRAIN_SCALE, 4),
            },
            {
                "key": "recovery_trend",
                "label": "Recovery trend",
                "render": "line",
                "derived_from": "recovery",
                # Semantic, not a literal colour: the frontend owns the palette.
                "accent": "good",
            },
            {
                "key": "strain_trend",
                "label": "Strain trend",
                "render": "line",
                "derived_from": "strain",
                "accent": "info",
            },
        ],
        "points": points,
        # Every tile is a mean over the range in view, so each label says so —
        # a bare "Recovery" reads as today's number, which it is not.
        "summary": [
            {
                "label": "Avg recovery",
                "value": f"{round(avg_recovery)}%" if avg_recovery is not None else "--",
                "delta": _delta(avg_recovery, prev_avg_recovery),
                "tone": _band(avg_recovery) or "neutral",
            },
            {
                "label": "Avg strain",
                "value": f"{avg_strain:.1f}" if avg_strain is not None else "--",
                "delta": _delta(avg_strain, prev_avg_strain, 1),
                "tone": "neutral",
            },
            {
                "label": "Avg calories",
                "value": f"{round(avg_calories):,}" if avg_calories is not None else "--",
                "delta": _delta(avg_calories, prev_avg_calories),
                "tone": "neutral",
            },
        ],
    }
