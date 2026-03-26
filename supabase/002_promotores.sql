-- Migracion: Tabla Promotores
-- Origen Access: Promotores (40 registros)
-- Relacion: 1 promotor -> muchas ventas / muchos operadores

create table if not exists public.promotores (
  id_promotor bigint primary key generated always as identity,
  nombre text,
  nick text,
  orden integer not null default 0,
  columna_servicios integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_promotores_nombre on public.promotores (nombre);
create index if not exists idx_promotores_orden on public.promotores (orden);
