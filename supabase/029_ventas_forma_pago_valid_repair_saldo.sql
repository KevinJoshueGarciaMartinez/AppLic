-- Reparación idempotente: asegurar que ventas.forma_pago acepte 'Saldo'.
-- Si en producción no se aplicó 022_ventas_forma_pago_saldo.sql, el CHECK
-- quedó solo con ('Efectivo','Deposito','Dividida') y falla al guardar
-- ventas con forma_pago = 'Saldo' (UI: "Saldo a favor").

alter table public.ventas
  drop constraint if exists ventas_forma_pago_valid;

alter table public.ventas
  add constraint ventas_forma_pago_valid
  check (forma_pago in ('Efectivo', 'Deposito', 'Dividida', 'Saldo'));
