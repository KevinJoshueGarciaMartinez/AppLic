-- Permite guardar recibos de abono con pago dividido
-- (efectivo + deposito) en operador_saldo_movimientos.

alter table public.operador_saldo_movimientos
  add column if not exists pago_efectivo numeric(12,2) not null default 0;

alter table public.operador_saldo_movimientos
  add column if not exists pago_deposito numeric(12,2) not null default 0;

update public.operador_saldo_movimientos
set
  pago_efectivo = coalesce(pago_efectivo, 0),
  pago_deposito = coalesce(pago_deposito, 0)
where pago_efectivo is null
   or pago_deposito is null;

alter table public.operador_saldo_movimientos
  drop constraint if exists operador_saldo_movimientos_forma_pago_check;

alter table public.operador_saldo_movimientos
  add constraint operador_saldo_movimientos_forma_pago_check
  check (
    forma_pago is null
    or forma_pago in ('Efectivo', 'Deposito', 'Transferencia', 'Tarjeta', 'Dividida')
  );
