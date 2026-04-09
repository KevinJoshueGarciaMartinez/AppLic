-- Referencia de depósito: texto libre (letras y números)
alter table public.ventas
  alter column numero_referencia type text using numero_referencia::text;
