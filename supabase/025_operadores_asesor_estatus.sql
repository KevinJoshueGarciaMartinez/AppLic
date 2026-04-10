-- Asesor en seguimiento; ampliación de estatus de seguimiento

alter table public.operadores
  add column if not exists asesor text;

alter table public.operadores
  drop constraint if exists operadores_estatus_seguimiento_check;

alter table public.operadores
  add constraint operadores_estatus_seguimiento_check check (
    estatus_seguimiento is null
    or estatus_seguimiento in (
      'Interesado',
      'Seguimiento',
      'Visita',
      'Cerrada',
      'Agendado',
      'En espera de documentos',
      'Pagado pero sin documentos'
    )
  );
