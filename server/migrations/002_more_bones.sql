-- Con 3 huesos/s se rechazaban partidas legales: a máxima velocidad, entre las filas
-- y los arcos sobre los obstáculos salen hasta ~5 por segundo. Lo subo con margen.
UPDATE games SET max_coins_per_sec = 6 WHERE slug = 'perrito-run';
