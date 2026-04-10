-- Alineación con la tabla real en Supabase (introspección vía REST select=* sobre catalogo_servicios_costos).
-- Columnas ya presentes: id_servicio, orden, servicio, tipo_servicio, costo_base, com_1, com_2,
-- precio_5 .. precio_17, created_at, updated_at.
-- Faltan respecto al seed 006 / migración 001: precio_3, precio_4 (PostgREST devuelve 400 si se piden).

alter table public.catalogo_servicios_costos
  add column if not exists precio_3 numeric(12,2) not null default 0,
  add column if not exists precio_4 numeric(12,2) not null default 0;
