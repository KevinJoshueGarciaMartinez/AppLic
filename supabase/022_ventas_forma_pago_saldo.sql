-- Migración: Agregar 'Saldo' como forma de pago independiente en ventas
-- Permite liquidar un ticket usando únicamente el saldo a favor del operador.

alter table public.ventas
  drop constraint if exists ventas_forma_pago_valid;

alter table public.ventas
  add constraint ventas_forma_pago_valid
  check (forma_pago in ('Efectivo', 'Deposito', 'Dividida', 'Saldo'));
