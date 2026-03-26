-- Migracion inicial basada en Access:
-- Tabla origen: "Catalogo servicios y costos"

create table if not exists public.catalogo_servicios_costos (
  id_servicio bigint primary key,
  orden integer not null default 0,
  servicio text not null,
  tipo_servicio integer,
  costo_base numeric(12,2) not null default 0,
  precio_3 numeric(12,2) not null default 0,
  precio_4 numeric(12,2) not null default 0,
  precio_5 numeric(12,2) not null default 0,
  precio_6 numeric(12,2) not null default 0,
  precio_7 numeric(12,2) not null default 0,
  precio_8 numeric(12,2) not null default 0,
  precio_9 numeric(12,2) not null default 0,
  precio_10 numeric(12,2) not null default 0,
  precio_11 numeric(12,2) not null default 0,
  precio_12 numeric(12,2) not null default 0,
  precio_13 numeric(12,2) not null default 0,
  precio_14 numeric(12,2) not null default 0,
  precio_15 numeric(12,2) not null default 0,
  precio_16 numeric(12,2) not null default 0,
  precio_17 numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_servicios_costos_costo_base_non_negative check (costo_base >= 0),
  constraint catalogo_servicios_costos_p3_non_negative check (precio_3 >= 0),
  constraint catalogo_servicios_costos_p4_non_negative check (precio_4 >= 0),
  constraint catalogo_servicios_costos_p5_non_negative check (precio_5 >= 0),
  constraint catalogo_servicios_costos_p6_non_negative check (precio_6 >= 0),
  constraint catalogo_servicios_costos_p7_non_negative check (precio_7 >= 0),
  constraint catalogo_servicios_costos_p8_non_negative check (precio_8 >= 0),
  constraint catalogo_servicios_costos_p9_non_negative check (precio_9 >= 0),
  constraint catalogo_servicios_costos_p10_non_negative check (precio_10 >= 0),
  constraint catalogo_servicios_costos_p11_non_negative check (precio_11 >= 0),
  constraint catalogo_servicios_costos_p12_non_negative check (precio_12 >= 0),
  constraint catalogo_servicios_costos_p13_non_negative check (precio_13 >= 0),
  constraint catalogo_servicios_costos_p14_non_negative check (precio_14 >= 0),
  constraint catalogo_servicios_costos_p15_non_negative check (precio_15 >= 0),
  constraint catalogo_servicios_costos_p16_non_negative check (precio_16 >= 0),
  constraint catalogo_servicios_costos_p17_non_negative check (precio_17 >= 0)
);

create index if not exists idx_catalogo_servicios_orden
  on public.catalogo_servicios_costos (orden);

create index if not exists idx_catalogo_servicios_tipo
  on public.catalogo_servicios_costos (tipo_servicio);

create index if not exists idx_catalogo_servicios_nombre
  on public.catalogo_servicios_costos (servicio);
