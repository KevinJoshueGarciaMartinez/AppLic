-- Nota permanente del operador, independiente de ventas y seguimiento comercial.
alter table public.operadores
  add column if not exists nota_operador text;

comment on column public.operadores.nota_operador is
  'Recordatorio general visible en el expediente y al registrar una venta.';
