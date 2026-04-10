-- Migración: Cancelación de ventas / tickets
-- Las ventas no se eliminan; se marcan como canceladas con motivo y fecha.
-- Si la venta pertenece a un ticket, se cancelan todas las filas del ticket en la app.

alter table public.ventas
  add column if not exists cancelado           boolean      not null default false,
  add column if not exists motivo_cancelacion  text,
  add column if not exists cancelado_at        timestamptz;

-- Índice parcial para consultar canceladas sin penalizar el resto
create index if not exists idx_ventas_cancelado
  on public.ventas (cancelado)
  where cancelado = true;
