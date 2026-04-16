-- Asegura fecha_captacion automatica al registrar operadores/prospectos.
-- Mantiene nullable la columna para no romper datos historicos.

alter table public.operadores
  alter column fecha_captacion set default current_date;
