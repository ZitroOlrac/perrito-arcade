-- Duelo de Llaves: juego 1 contra 1 en tiempo real, con ranking ELO

ALTER TABLE games ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'duel'));

INSERT INTO games (slug, name, description, max_points_per_sec, max_coins_per_sec, mode) VALUES
  ('duelo-llaves', 'Duelo de Llaves',
   'Uno contra uno en tiempo real. Aprieta los tornillos antes que tu rival: los oxidados cuestan más, los dorados vuelan.',
   0, 0, 'duel');

CREATE TABLE duel_ratings (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL DEFAULT 1000,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  draws      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX duel_ratings_rating_idx ON duel_ratings (rating DESC);

CREATE TABLE duels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL cuando el rival es el bot
  player_b        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  score_a         INTEGER NOT NULL,
  score_b         INTEGER NOT NULL,
  result          VARCHAR(5) NOT NULL CHECK (result IN ('a', 'b', 'draw')),
  end_reason      VARCHAR(10) NOT NULL CHECK (end_reason IN ('score', 'time', 'forfeit')),
  rated           BOOLEAN NOT NULL,
  rating_change_a INTEGER NOT NULL DEFAULT 0,
  rating_change_b INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX duels_player_a_idx ON duels (player_a, ended_at DESC);
CREATE INDEX duels_player_b_idx ON duels (player_b, ended_at DESC);
CREATE INDEX duels_ended_idx ON duels (ended_at DESC);
