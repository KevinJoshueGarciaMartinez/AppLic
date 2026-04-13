-- Nuevo catálogo de estatus_seguimiento; se conservan valores legados (025).

alter table public.operadores
  drop constraint if exists operadores_estatus_seguimiento_check;

alter table public.operadores
  add constraint operadores_estatus_seguimiento_check check (
    estatus_seguimiento is null
    or estatus_seguimiento in (
      'Seguimiento',
      'Agendado',
      'En espera de doc',
      'Pagado pero sin doc',
      'Ingresado',
      'No le interesa',
      'Interesado',
      'Visita',
      'Cerrada',
      'En espera de documentos',
      'Pagado pero sin documentos'
    )
  );
