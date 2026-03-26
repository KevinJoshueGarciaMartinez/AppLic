-- Migracion: Tabla Ventas
-- Origen Access: Ventas (42767 registros)
-- Tabla central del negocio
-- Depende de: catalogo_servicios_costos, promotores

create table if not exists public.ventas (
  id bigint primary key generated always as identity,
  fecha date not null default current_date,
  hora time,

  -- Operador (referencia por CURP, como en Access)
  curp_operador text,

  -- Promotor
  id_promotor bigint references public.promotores (id_promotor) on delete restrict,
  promotor text,

  -- Servicio
  id_servicio bigint references public.catalogo_servicios_costos (id_servicio) on delete restrict,
  servicio text,
  tipo_servicio integer,

  -- Costos y cobros
  costo numeric(12,2) not null default 0,
  costo_promotor numeric(12,2) not null default 0,
  -- comision_promotor se calcula: costo - costo_promotor
  comision_pagada boolean not null default false,
  cobro numeric(12,2) not null default 0,
  -- faltante se calcula: costo - cobro
  egreso integer not null default 0,
  -- total_cobrado se calcula: cobro - egreso

  -- Pago
  forma_pago text not null default 'Efectivo',
  numero_referencia integer,

  -- Extra
  observaciones text,
  fecha_solicitud_curso date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ventas_cobro_non_negative check (cobro >= 0),
  constraint ventas_costo_non_negative check (costo >= 0),
  constraint ventas_forma_pago_valid check (forma_pago in ('Efectivo', 'Deposito'))
);

-- Columnas calculadas como generated (equivalente a campos calculados de Access)
alter table public.ventas
  add column if not exists comision_promotor numeric(12,2)
    generated always as (costo - costo_promotor) stored;

alter table public.ventas
  add column if not exists faltante numeric(12,2)
    generated always as (costo - cobro) stored;

alter table public.ventas
  add column if not exists total_cobrado numeric(12,2)
    generated always as (cobro - egreso) stored;

create index if not exists idx_ventas_fecha on public.ventas (fecha);
create index if not exists idx_ventas_curp_operador on public.ventas (curp_operador);
create index if not exists idx_ventas_id_promotor on public.ventas (id_promotor);
create index if not exists idx_ventas_id_servicio on public.ventas (id_servicio);
create index if not exists idx_ventas_forma_pago on public.ventas (forma_pago);
