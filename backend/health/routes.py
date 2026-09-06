import datetime as dt
import time

from fastapi import APIRouter, HTTPException

from backend.integrations import whoop

from . import graph, store

router = APIRouter(prefix="/health")

# Named ranges the dashboard offers, in days. `all` resolves against whatever
# the mirror actually holds.
TIMEFRAMES = {"7d": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365}


@router.get("/graph")
async def health_graph(
    start: float | None = None,
    end: float | None = None,
    timeframe: str | None = None,
    bucket: str = "auto",
):
    """Strain + recovery chart payload. Either epoch `start`/`end`, or a named
    `timeframe` (7d, 1m, 3m, 6m, 1y, all)."""
    if timeframe:
        end = time.time()
        if timeframe == "all":
            first = (await store.coverage())["first"]
            if not first:
                raise HTTPException(404, "No WHOOP data synced yet. POST /health/sync.")
            start = dt.datetime.fromisoformat(first).timestamp()
        elif timeframe in TIMEFRAMES:
            start = end - TIMEFRAMES[timeframe] * 86400
        else:
            raise HTTPException(
                400, f"Unknown timeframe. Use one of: {', '.join(TIMEFRAMES)}, all"
            )
    if start is None or end is None:
        raise HTTPException(400, "Provide either start+end (epoch seconds) or timeframe.")
    if end <= start:
        raise HTTPException(400, "end must be after start.")

    span = end - start
    rows = await store.get_days(dt.date.fromtimestamp(start), dt.date.fromtimestamp(end))
    previous = await store.get_days(
        dt.date.fromtimestamp(start - span), dt.date.fromtimestamp(start)
    )
    return graph.build(rows, start, end, previous=previous, bucket=bucket)


@router.post("/sync")
async def health_sync(full: bool = False):
    """Pull WHOOP into the local mirror. Incremental unless `full`."""
    if not whoop.is_authenticated():
        raise HTTPException(401, "WHOOP not connected.")
    try:
        return await store.sync(since=dt.datetime(2012, 1, 1) if full else None)
    except RuntimeError as e:
        raise HTTPException(401, str(e))


@router.get("/coverage")
async def health_coverage():
    return await store.coverage()
