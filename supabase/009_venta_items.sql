-- Migración: Líneas de ticket por venta
-- Permite agregar múltiples servicios a una sola venta

create table if not exists public.venta_items (
  id          bigint primary key generated always as identity,
  venta_id    bigint not null references public.ventas(id) on delete cascade,
  id_servicio bigint references public.catalogo_servicios_costos(id_servicio) on delete set null,
  servicio    text not null default '',
  tipo_servicio integer,
  costo       numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_venta_items_venta_id on public.venta_items(venta_id);
