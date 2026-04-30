-- Agrega "Pago Parcial" al catalogo permitido en estatus_seguimiento.
-- Mantiene compatibilidad con valores historicos de migraciones previas.

alter table public.operadores
  drop constraint if exists operadores_estatus_seguimiento_check;

alter table public.operadores
  add constraint operadores_estatus_seguimiento_check check (
    estatus_seguimiento is null
    or estatus_seguimiento in (
      'Seguimiento',
      'Agendado',
      'En espera de doc',
      'Pendiente de pago',
      'Pago Parcial',
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
