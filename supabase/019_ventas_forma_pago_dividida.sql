-- Forma de pago "Dividida" + desglose (ticket): efectivo, depósito, saldo operador

alter table public.ventas
  add column if not exists pago_efectivo numeric(12,2) not null default 0,
  add column if not exists pago_deposito numeric(12,2) not null default 0,
  add column if not exists pago_saldo_operador numeric(12,2) not null default 0;

alter table public.ventas
  drop constraint if exists ventas_forma_pago_valid;

alter table public.ventas
  add constraint ventas_forma_pago_valid
  check (forma_pago in ('Efectivo', 'Deposito', 'Dividida'));

alter table public.ventas
  add constraint ventas_pago_split_non_negative
  check (
    pago_efectivo >= 0
    and pago_deposito >= 0
    and pago_saldo_operador >= 0
  );
