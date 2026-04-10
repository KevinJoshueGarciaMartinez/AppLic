-- Migracion: Registro ligero (prospectos) y seguimiento comercial en operadores
-- CURP obligatorio solo cuando ya no es prospecto (es_prospecto = false)

alter table public.operadores
  add column if not exists es_prospecto boolean not null default false;

alter table public.operadores
  add column if not exists medio_captacion text;

alter table public.operadores
  add column if not exists fecha_captacion date;

alter table public.operadores
  add column if not exists proxima_llamada date;

alter table public.operadores
  add column if not exists estatus_seguimiento text;

alter table public.operadores
  add column if not exists notas_seguimiento text;

alter table public.operadores
  drop constraint if exists operadores_curp_not_empty;

alter table public.operadores
  alter column curp drop not null;

alter table public.operadores
  drop constraint if exists operadores_curp_cuando_no_prospecto;

alter table public.operadores
  add constraint operadores_curp_cuando_no_prospecto check (
    es_prospecto = true
    or (curp is not null and btrim(curp) <> '')
  );

alter table public.operadores
  drop constraint if exists operadores_medio_captacion_check;

alter table public.operadores
  add constraint operadores_medio_captacion_check check (
    medio_captacion is null
    or medio_captacion in ('Email', 'Telefono', 'Redes', 'Presencial', 'Referido', 'Otro')
  );

alter table public.operadores
  drop constraint if exists operadores_estatus_seguimiento_check;

alter table public.operadores
  add constraint operadores_estatus_seguimiento_check check (
    estatus_seguimiento is null
    or estatus_seguimiento in ('Interesado', 'Seguimiento', 'Visita', 'Cerrada')
  );

create index if not exists idx_operadores_es_prospecto on public.operadores (es_prospecto);
create index if not exists idx_operadores_proxima_llamada on public.operadores (proxima_llamada);
create index if not exists idx_operadores_estatus_seguimiento on public.operadores (estatus_seguimiento);
