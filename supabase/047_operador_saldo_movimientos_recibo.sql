-- Permite capturar recibos directos de abono para operador
-- sin ligarlos a una venta o ticket.

alter table public.operador_saldo_movimientos
  add column if not exists fecha date;

update public.operador_saldo_movimientos
set fecha = coalesce(fecha, (created_at at time zone 'America/Mexico_City')::date)
where fecha is null;

alter table public.operador_saldo_movimientos
  alter column fecha set default current_date;

alter table public.operador_saldo_movimientos
  alter column fecha set not null;

alter table public.operador_saldo_movimientos
  add column if not exists forma_pago text;

alter table public.operador_saldo_movimientos
  drop constraint if exists operador_saldo_movimientos_forma_pago_check;

alter table public.operador_saldo_movimientos
  add constraint operador_saldo_movimientos_forma_pago_check
  check (
    forma_pago is null
    or forma_pago in ('Efectivo', 'Deposito', 'Transferencia', 'Tarjeta')
  );

alter table public.operador_saldo_movimientos
  add column if not exists referencia text;
