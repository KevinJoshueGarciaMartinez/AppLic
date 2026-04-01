-- Migración: Cambiar referencia de operador en ventas
-- De: curp_operador text (sin FK)
-- A:  operador_id bigint FK + operador_nombre text (patrón igual a promotores)

-- 1. Agregar nuevas columnas
alter table public.ventas
  add column if not exists operador_id bigint
    references public.operadores (numero_consecutivo) on delete set null;

alter table public.ventas
  add column if not exists operador_nombre text;

-- 2. Poblar desde datos existentes (match por CURP)
update public.ventas v
set
  operador_id = o.numero_consecutivo,
  operador_nombre = trim(
    concat_ws(' ', o.nombre, o.apellido_paterno, o.apellido_materno)
  )
from public.operadores o
where v.curp_operador = o.curp
  and v.curp_operador is not null;

-- 3. Índice para la nueva FK
create index if not exists idx_ventas_operador_id on public.ventas (operador_id);

-- 4. Eliminar columna y índice anteriores
drop index if exists public.idx_ventas_curp_operador;

alter table public.ventas
  drop column if exists curp_operador;
