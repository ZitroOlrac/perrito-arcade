CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(20) NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- el nombre de usuario no distingue mayúsculas: "Pepe" y "pepe" son el mismo
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

CREATE TABLE games (
  slug        VARCHAR(30) PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- límites que usa el servidor para descartar puntuaciones imposibles
  max_points_per_sec NUMERIC(8, 2) NOT NULL,
  max_coins_per_sec  NUMERIC(8, 2) NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_slug     VARCHAR(30) NOT NULL REFERENCES games(slug),
  status        VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finished', 'rejected')),
  score         INTEGER,
  distance      INTEGER,
  coins         INTEGER,
  duration_ms   INTEGER,
  reject_reason TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

CREATE INDEX game_sessions_ranking_idx
  ON game_sessions (game_slug, score DESC)
  WHERE status = 'finished';

CREATE INDEX game_sessions_user_idx ON game_sessions (user_id, started_at DESC);

INSERT INTO games (slug, name, description, max_points_per_sec, max_coins_per_sec) VALUES
  ('perrito-run', 'Perrito Run',
   'Corre por el taller esquivando neumáticos y cajas de herramientas. Recoge huesos para sumar puntos.',
   40, 3);
