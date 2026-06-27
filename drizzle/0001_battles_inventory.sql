ALTER TABLE players ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS battle_requests_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE players ADD COLUMN IF NOT EXISTS selected_title varchar(64);

ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS battle_win_streak integer NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS best_battle_win_streak integer NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS active_item text;

ALTER TABLE group_members ADD COLUMN IF NOT EXISTS group_battle_wins integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS player_inventory (
  telegram_user_id text NOT NULL REFERENCES players(telegram_user_id),
  item_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_user_id, item_key)
);

CREATE TABLE IF NOT EXISTS battles (
  id serial PRIMARY KEY,
  telegram_chat_id text NOT NULL,
  challenger_id text NOT NULL,
  opponent_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  challenger_score integer NOT NULL DEFAULT 0,
  opponent_score integer NOT NULL DEFAULT 0,
  winner_id text,
  challenge_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS battles_chat_created_idx ON battles(telegram_chat_id, created_at);
CREATE INDEX IF NOT EXISTS battles_challenger_idx ON battles(challenger_id, created_at);
CREATE INDEX IF NOT EXISTS battles_opponent_idx ON battles(opponent_id, created_at);

CREATE TABLE IF NOT EXISTS battle_deliveries (
  id serial PRIMARY KEY,
  battle_id integer NOT NULL REFERENCES battles(id),
  telegram_user_id text NOT NULL,
  ball_number integer NOT NULL,
  outcome text NOT NULL,
  runs integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_hits_user_created_idx ON daily_hits(telegram_user_id, created_at);
CREATE INDEX IF NOT EXISTS daily_hits_chat_created_idx ON daily_hits(telegram_chat_id, created_at);
