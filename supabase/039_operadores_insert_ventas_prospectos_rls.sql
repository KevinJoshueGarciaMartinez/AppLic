-- Ajusta RLS de insert en operadores:
-- Admin/Recepcion mantienen insercion total.
-- Ventas solo puede insertar registros marcados como prospecto.

drop policy if exists operadores_insert on public.operadores;

create policy operadores_insert on public.operadores
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
