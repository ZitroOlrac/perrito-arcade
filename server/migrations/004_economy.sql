-- Fase 3: los huesos pasan a ser moneda. Tienda de skins del perrito y logros.

-- Saldo guardado en el usuario para leerlo rápido, y un libro de movimientos para saber
-- de dónde sale cada hueso. El CHECK hace que sea imposible quedarse en negativo
-- aunque haya un fallo en el código.
ALTER TABLE users ADD COLUMN bones INTEGER NOT NULL DEFAULT 0 CHECK (bones >= 0);

CREATE TABLE bone_transactions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL CHECK (amount <> 0),
  reason     VARCHAR(20) NOT NULL CHECK (reason IN ('run', 'duel', 'achievement', 'purchase', 'backfill')),
  ref        TEXT, -- id de la partida, del logro o de la skin
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bone_transactions_user_idx ON bone_transactions (user_id, created_at DESC);

-- un mismo origen no puede pagar dos veces (p. ej. la misma partida)
CREATE UNIQUE INDEX bone_transactions_once_idx ON bone_transactions (user_id, reason, ref)
  WHERE reason IN ('run', 'duel', 'achievement', 'purchase');

-- Las skins son cambios de paleta del sprite del perrito (ver client/src/game/sprites.ts)
CREATE TABLE skins (
  slug       VARCHAR(30) PRIMARY KEY,
  name       VARCHAR(40) NOT NULL,
  price      INTEGER NOT NULL CHECK (price >= 0),
  palette    JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_skins (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skin_slug   VARCHAR(30) NOT NULL REFERENCES skins(slug),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skin_slug)
);

INSERT INTO skins (slug, name, price, palette, sort_order) VALUES
  ('clasico', 'Clásico',   0,    '{}', 0),
  ('carbon',  'Carbón',    150,  '{"B":"#3a3532","D":"#1f1b19","L":"#5a524d","W":"#c9c1b5","R":"#2f8f5b"}', 1),
  ('nieve',   'Nieve',     150,  '{"B":"#ece6da","D":"#b9b0a2","L":"#ffffff","W":"#ffffff","R":"#3d7dd8","Y":"#e3e3e3"}', 2),
  ('canela',  'Canela',    300,  '{"B":"#d9973f","D":"#9c5f1f","L":"#f2c27a","R":"#7b3fb5"}', 3),
  ('grasa',   'Mecánico',  500,  '{"B":"#8a7560","D":"#3b3029","L":"#a8927a","W":"#3d7dd8","R":"#f2c230","Y":"#1c1a19"}', 4),
  ('neon',    'Neón',      900,  '{"B":"#2be0b0","D":"#118a6c","L":"#a4ffe9","W":"#ff4fd8","R":"#ff4fd8","P":"#ffe14f"}', 5),
  ('oro',     'Oro macizo',2000, '{"B":"#e6b422","D":"#a37c10","L":"#fff1a8","W":"#fff8d6","R":"#d63a2f","Y":"#ffffff"}', 6);

ALTER TABLE users ADD COLUMN equipped_skin VARCHAR(30) NOT NULL DEFAULT 'clasico' REFERENCES skins(slug);

CREATE TABLE achievements (
  slug        VARCHAR(30) PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  reward      INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_achievements (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_slug VARCHAR(30) NOT NULL REFERENCES achievements(slug),
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_slug)
);

INSERT INTO achievements (slug, name, description, reward, sort_order) VALUES
  ('primera-carrera', 'Primeros pasos',   'Termina tu primera partida de Perrito Run',        10,  1),
  ('quinientos',      'Calentando',       'Recorre 500 m en una partida',                     30,  2),
  ('maraton',         'Maratón',          'Recorre 1500 m en una partida',                    100, 3),
  ('coleccionista',   'Coleccionista',    'Recoge 500 huesos en total',                       50,  4),
  ('primer-duelo',    'Primera victoria', 'Gana tu primer duelo contra otra persona',         25,  5),
  ('cinco-duelos',    'Llave maestra',    'Gana 5 duelos contra otras personas',              75,  6),
  ('elo-1100',        'Jefe de taller',   'Llega a 1100 de ELO en el Duelo de Llaves',        150, 7),
  ('primera-compra',  'De estreno',       'Compra tu primera skin en la tienda',              0,   8);

-- las skins gratis (precio 0) se tienen siempre, no hace falta apuntarlas en user_skins

-- los huesos de las partidas que ya se jugaron antes de que existiera la tienda
WITH earned AS (
  SELECT user_id, SUM(coins) AS total
  FROM game_sessions
  WHERE status = 'finished' AND coins > 0
  GROUP BY user_id
)
INSERT INTO bone_transactions (user_id, amount, reason)
SELECT user_id, total, 'backfill' FROM earned;

UPDATE users u SET bones = t.total
FROM (SELECT user_id, SUM(amount) AS total FROM bone_transactions GROUP BY user_id) t
WHERE t.user_id = u.id;
