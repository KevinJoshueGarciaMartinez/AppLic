-- Agrega columna de fecha de pago de comisión a ventas
alter table public.ventas
  add column if not exists fecha_pago date;
