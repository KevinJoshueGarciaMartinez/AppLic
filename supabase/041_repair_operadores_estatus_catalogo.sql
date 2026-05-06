-- Reparación defensiva del catálogo de estatus_seguimiento en operadores.
-- Corrige entornos donde quedó un CHECK antiguo y bloquea estatus válidos en alta.

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
      -- Compatibilidad con valores históricos
      'Interesado',
      'Visita',
      'Cerrada',
      'En espera de documentos',
      'Pagado pero sin documentos'
    )
  );
