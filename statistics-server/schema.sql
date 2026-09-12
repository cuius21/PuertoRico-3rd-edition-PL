CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT NOT NULL,
  player_count INTEGER NOT NULL CHECK(player_count BETWEEN 3 AND 5),
  kind TEXT NOT NULL CHECK(kind IN ('mixed','bots','humans')),
  expansions TEXT NOT NULL,
  build TEXT NOT NULL,
  bot_version TEXT NOT NULL,
  human_credit REAL NOT NULL,
  bot_credit REAL NOT NULL,
  tied INTEGER NOT NULL,
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  history_json TEXT NOT NULL CHECK(json_valid(history_json))
);
CREATE INDEX IF NOT EXISTS matches_filters ON matches(player_count, kind, ended_at);
CREATE INDEX IF NOT EXISTS matches_ended ON matches(ended_at);

