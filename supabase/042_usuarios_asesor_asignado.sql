-- Asignacion de asesor por usuario para seguimiento comercial.
-- Regla de negocio:
-- - Admin puede ver todo.
-- - No admin solo ve su asesor asignado.
-- - Si no tiene asesor asignado, no ve prospectos y no puede crear.

alter table public.usuarios
  add column if not exists asesor_asignado text;

create index if not exists idx_usuarios_asesor_asignado
  on public.usuarios (asesor_asignado);
