-- RLS para gestion de usuarios/roles:
-- - Admin: puede leer/actualizar usuarios y niveles.
-- - Usuario autenticado: puede leerse a si mismo (solo en usuarios).

alter table public.usuarios enable row level security;
alter table public.usuarios_nivel enable row level security;

drop policy if exists usuarios_select_admin_or_self on public.usuarios;
drop policy if exists usuarios_update_admin on public.usuarios;
drop policy if exists usuarios_insert_admin on public.usuarios;
drop policy if exists usuarios_delete_admin on public.usuarios;

create policy usuarios_select_admin_or_self on public.usuarios
for select using (
  public.app_is_admin() or id_usuario = auth.uid()
);

create policy usuarios_update_admin on public.usuarios
for update using (public.app_is_admin())
with check (public.app_is_admin());

create policy usuarios_insert_admin on public.usuarios
for insert with check (public.app_is_admin());

create policy usuarios_delete_admin on public.usuarios
for delete using (public.app_is_admin());

drop policy if exists usuarios_nivel_select_authenticated on public.usuarios_nivel;
drop policy if exists usuarios_nivel_write_admin on public.usuarios_nivel;

create policy usuarios_nivel_select_authenticated on public.usuarios_nivel
for select using (auth.uid() is not null);

create policy usuarios_nivel_write_admin on public.usuarios_nivel
for all using (public.app_is_admin())
with check (public.app_is_admin());
