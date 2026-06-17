-- Fix RLS insert policy for prospect creation from Seguimiento (rol: ventas).
-- Some environments still have the old policy that only allows admin/recepcion.

drop policy if exists operadores_insert on public.operadores;

create policy operadores_insert
on public.operadores
for insert
with check (
  public.app_is_admin()
  or public.app_is_recepcion()
  or (
    public.app_is_ventas()
    and coalesce(es_prospecto, false) = true
  )
);
