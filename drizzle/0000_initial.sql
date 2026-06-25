CREATE TABLE IF NOT EXISTS players (
  telegram_user_id text PRIMARY KEY,
  username text,
  first_name text,
  last_name text,
  language_code text,
  is_bot boolean NOT NULL DEFAULT false,
  is_banned boolean NOT NULL DEFAULT false,
  public_ranking boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_stats (
  telegram_user_id text PRIMARY KEY REFERENCES players(telegram_user_id),
  six_power integer NOT NULL DEFAULT 0,
  career_sixes integer NOT NULL DEFAULT 0,
  career_fours integer NOT NULL DEFAULT 0,
  total_runs integer NOT NULL DEFAULT 0,
  balls_faced integer NOT NULL DEFAULT 0,
  dot_balls integer NOT NULL DEFAULT 0,
  dismissals integer NOT NULL DEFAULT 0,
  longest_six integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  bat_power_level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  title varchar(64) NOT NULL DEFAULT 'Net Batter',
  daily_attempts integer NOT NULL DEFAULT 0,
  successful_hit_days integer NOT NULL DEFAULT 0,
  battles_played integer NOT NULL DEFAULT 0,
  battles_won integer NOT NULL DEFAULT 0,
  battles_lost integer NOT NULL DEFAULT 0,
  battles_drawn integer NOT NULL DEFAULT 0,
  highest_battle_score integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  next_hit_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  telegram_chat_id text PRIMARY KEY,
  title text,
  type text NOT NULL,
  game_enabled boolean NOT NULL DEFAULT true,
  battles_enabled boolean NOT NULL DEFAULT true,
  hardcore_mode boolean NOT NULL DEFAULT false,
  daily_announcement boolean NOT NULL DEFAULT true,
  cooldown_hours integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  telegram_chat_id text NOT NULL REFERENCES chats(telegram_chat_id),
  telegram_user_id text NOT NULL REFERENCES players(telegram_user_id),
  group_sixes integer NOT NULL DEFAULT 0,
  group_runs integer NOT NULL DEFAULT 0,
  group_attempts integer NOT NULL DEFAULT 0,
  group_longest_six integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_chat_id, telegram_user_id)
);

CREATE TABLE IF NOT EXISTS daily_hits (
  id serial PRIMARY KEY,
  telegram_update_id text NOT NULL,
  telegram_chat_id text NOT NULL,
  telegram_user_id text NOT NULL,
  outcome text NOT NULL,
  runs integer NOT NULL DEFAULT 0,
  sixes integer NOT NULL DEFAULT 0,
  fours integer NOT NULL DEFAULT 0,
  balls integer NOT NULL DEFAULT 1,
  distance integer,
  six_power_delta integer NOT NULL DEFAULT 0,
  new_achievements jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_hits_update_id_idx ON daily_hits(telegram_update_id);

CREATE TABLE IF NOT EXISTS achievements (
  telegram_user_id text NOT NULL REFERENCES players(telegram_user_id),
  code text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_user_id, code)
);
