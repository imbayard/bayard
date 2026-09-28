"""analytics.db: paths and schema. Imported by both the web process and the runner
subprocess, so it must stay free of polars/numpy — the web process never loads them.

Only the tables the current slice uses exist here; the full target schema lives in the
vault (Analytics Pipeline / 02 Storage & Schema).
"""

import sqlite3

from backend.config import DATA_DIR

DB_PATH = DATA_DIR / "analytics.db"
RAW_DIR = DATA_DIR / "analytics" / "raw"

# Unit subjects in metric_value would be unit_id + UNIT_OFFSET, so players and units can
# share one metrics table. No units yet; reserved so pids never grow into that range.
UNIT_OFFSET = 1_000_000

# metric_value.win
WINDOWS = {0: "week", 1: "last4", 2: "season", 3: "prior"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS run (
  run_id INTEGER PRIMARY KEY, kind TEXT NOT NULL,
  season INTEGER, week INTEGER, status TEXT NOT NULL,       -- running|ok|partial|failed
  started_at TEXT NOT NULL, finished_at TEXT, code_version TEXT,
  source_stamps TEXT, rows_written INTEGER, error TEXT);

CREATE TABLE IF NOT EXISTS source_stamp (                   -- what each raw file was when pulled
  dataset TEXT, season INTEGER,                             -- season 0 = not seasonal
  upstream_version TEXT,                                    -- release asset updated_at, or HTTP ETag
  sha256 TEXT, rows INTEGER, schema_ok INTEGER, pulled_at TEXT,
  PRIMARY KEY (dataset, season));

CREATE TABLE IF NOT EXISTS player (
  pid INTEGER PRIMARY KEY, gsis_id TEXT UNIQUE, pfr_id TEXT, sleeper_id TEXT, espn_id TEXT,
  name TEXT NOT NULL, position TEXT, pos_group TEXT,         -- QB RB WR TE OL DL LB DB K P LS
  birth_date TEXT, entry_year INTEGER, draft_pick INTEGER);
CREATE INDEX IF NOT EXISTS player_sleeper ON player (sleeper_id);
CREATE INDEX IF NOT EXISTS player_espn ON player (espn_id);
CREATE INDEX IF NOT EXISTS player_pfr ON player (pfr_id);

CREATE TABLE IF NOT EXISTS xwalk_issue (                    -- source IDs that didn't link exactly
  source TEXT, source_id TEXT, name TEXT, team TEXT, position TEXT,
  pid INTEGER, method TEXT, confidence REAL, resolved_at TEXT,   -- method: name_team|jev|manual; NULL = unresolved
  PRIMARY KEY (source, source_id));

CREATE TABLE IF NOT EXISTS game (
  game_id TEXT PRIMARY KEY, season INTEGER, week INTEGER, game_type TEXT, kickoff TEXT,
  home TEXT, away TEXT, spread REAL, total REAL, home_ml INTEGER, away_ml INTEGER,
  roof TEXT, surface TEXT, home_rest INTEGER, away_rest INTEGER,
  home_qb_pid INTEGER, away_qb_pid INTEGER, home_score INTEGER, away_score INTEGER);

CREATE TABLE IF NOT EXISTS player_game (                    -- who played, how much: every position
  pid INTEGER, game_id TEXT, season INTEGER, week INTEGER, team TEXT,
  off_snaps INTEGER, off_pct REAL, def_snaps INTEGER, def_pct REAL, st_pct REAL,
  PRIMARY KEY (pid, game_id)) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS metric (
  mid INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL, pos_groups TEXT, family TEXT,
  label TEXT, description TEXT, uom TEXT, higher_is_better INTEGER,
  min_sample REAL, shrink_k REAL, yoy_r REAL, validated_on TEXT,
  in_season INTEGER, source TEXT, version INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS metric_value (
  subject INTEGER, season INTEGER, week INTEGER, mid INTEGER,
  win INTEGER,                                              -- 0 week · 1 last-4 · 2 season-to-date · 3 prior
  value REAL, value_shrunk REAL, pct REAL, n REAL,
  PRIMARY KEY (subject, season, week, mid, win)) WITHOUT ROWID;
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    return db


def create_tables() -> None:
    with connect() as db:
        db.executescript(SCHEMA)
