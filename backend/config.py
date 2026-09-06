import os
import pathlib

MODEL_CHAT = "claude-haiku-4-5-20251001"
MODEL_PLANNER = "claude-sonnet-4-5"
MODEL_GENERATOR = "claude-haiku-4-5-20251001"

# Persistent state — SQLite databases and OAuth tokens. On Railway this points at
# a mounted volume: the container filesystem is recreated on every deploy, so
# anything written beside the code (tokens especially) is gone after a push.
# DB_DIR is the older name, still honored so existing deploys keep working.
DATA_DIR = pathlib.Path(
    os.environ.get("DATA_DIR")
    or os.environ.get("DB_DIR")
    or pathlib.Path(__file__).parent / "data"
)
DATA_DIR.mkdir(parents=True, exist_ok=True)
