-- Seed: Promotores activos
-- Solo se insertan los 3 promotores indicados por el usuario.
-- Los IDs corresponden a los registros originales de Access.

INSERT INTO public.promotores (id_promotor, nombre, nick, orden, columna_servicios)
VALUES
  (3,  'Alfredo Chavez', 'Alfredo', 5, 5),
  (4,  'Valeria Chavez', 'Valeria', 0, 0),
  (18, 'Aranza Chavez',  'Aranza',  0, 0)
ON CONFLICT (id_promotor) DO UPDATE SET
  nombre             = EXCLUDED.nombre,
  nick               = EXCLUDED.nick,
  orden              = EXCLUDED.orden,
  columna_servicios  = EXCLUDED.columna_servicios;
