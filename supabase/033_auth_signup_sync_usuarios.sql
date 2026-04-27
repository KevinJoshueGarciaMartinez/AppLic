-- Fase 3: sincronizar altas de Supabase Auth -> public.usuarios
-- Objetivo: cuando se crea un usuario en auth.users, generar su registro base
-- en public.usuarios para que despues se le asigne rol/nivel.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id_usuario, nombre_usuario, usuario, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    true
  )
  on conflict (id_usuario) do update
  set
    usuario = excluded.usuario,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sync_usuarios on auth.users;
create trigger on_auth_user_created_sync_usuarios
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill para usuarios ya creados en auth.users y que aun no existen en public.usuarios
insert into public.usuarios (id_usuario, nombre_usuario, usuario, activo)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'full_name', split_part(au.email, '@', 1)) as nombre_usuario,
  au.email as usuario,
  true as activo
from auth.users au
left join public.usuarios u on u.id_usuario = au.id
where u.id_usuario is null;
