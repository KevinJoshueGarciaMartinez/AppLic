-- Un usuario puede atender uno o varios asesores de seguimiento.
-- Tambien sustituye las combinaciones JESSE por ANDREA conservando el historial.

create table if not exists public.usuarios_asesores (
  id bigint primary key generated always as identity,
  id_usuario uuid not null references public.usuarios(id_usuario) on delete cascade,
  asesor text not null check (length(btrim(asesor)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create unique index if not exists uq_usuarios_asesores_usuario_normalizado
  on public.usuarios_asesores (id_usuario, upper(btrim(asesor)));

create index if not exists idx_usuarios_asesores_usuario
  on public.usuarios_asesores (id_usuario);

alter table public.usuarios_asesores enable row level security;

drop policy if exists usuarios_asesores_select on public.usuarios_asesores;
drop policy if exists usuarios_asesores_insert on public.usuarios_asesores;
drop policy if exists usuarios_asesores_update on public.usuarios_asesores;
drop policy if exists usuarios_asesores_delete on public.usuarios_asesores;

create policy usuarios_asesores_select on public.usuarios_asesores
for select using (public.app_is_admin() or id_usuario = auth.uid());

-- Las asignaciones se modifican con las funciones transaccionales de abajo.
create policy usuarios_asesores_insert on public.usuarios_asesores
for insert with check (false);
create policy usuarios_asesores_update on public.usuarios_asesores
for update using (false) with check (false);
create policy usuarios_asesores_delete on public.usuarios_asesores
for delete using (false);

grant select on public.usuarios_asesores to authenticated;

drop index if exists public.uq_usuarios_asesor_asignado_normalizado;

-- Renombrar todos los prospectos, operadores y asignaciones historicas.
update public.operadores
set asesor = case upper(btrim(asesor))
  when 'JESSE - VERO' then 'ANDREA - VERO'
  when 'JESSE - RENATA' then 'ANDREA - RENATA'
  else asesor
end,
updated_at = now()
where upper(btrim(coalesce(asesor, ''))) in ('JESSE - VERO', 'JESSE - RENATA');

update public.usuarios
set asesor_asignado = case upper(btrim(asesor_asignado))
  when 'JESSE - VERO' then 'ANDREA - VERO'
  when 'JESSE - RENATA' then 'ANDREA - RENATA'
  else asesor_asignado
end,
updated_at = now()
where upper(btrim(coalesce(asesor_asignado, ''))) in ('JESSE - VERO', 'JESSE - RENATA');

-- Conservar como primera asignacion lo que ya tenia cada correo.
insert into public.usuarios_asesores (id_usuario, asesor, created_by)
select u.id_usuario, upper(btrim(u.asesor_asignado)), null
from public.usuarios u
where btrim(coalesce(u.asesor_asignado, '')) <> ''
on conflict do nothing;

-- Asignar las dos combinaciones al correo solicitado. Se exige una sola
-- coincidencia para no conceder acceso al usuario equivocado.
do $$
declare
  v_usuario_id uuid;
  v_coincidencias integer;
begin
  select count(*), min(id_usuario::text)::uuid
  into v_coincidencias, v_usuario_id
  from public.usuarios
  where lower(coalesce(usuario, '')) like '%verovillafan%';

  if v_coincidencias > 1 then
    raise exception 'Hay mas de un correo que coincide con verovillafan; no se modificaron sus asignaciones.';
  elsif v_coincidencias = 1 then
    delete from public.usuarios_asesores where id_usuario = v_usuario_id;
    insert into public.usuarios_asesores (id_usuario, asesor, created_by) values
      (v_usuario_id, 'ANDREA - VERO', null),
      (v_usuario_id, 'ANDREA - RENATA', null);
    update public.usuarios
    set asesor_asignado = 'ANDREA - VERO', updated_at = now()
    where id_usuario = v_usuario_id;
  else
    raise notice 'No se encontro un correo que contenga verovillafan. Asignalo desde ADMINISTRACION > USUARIOS.';
  end if;
end;
$$;

create or replace function public.set_usuario_asesores(
  p_usuario_id uuid,
  p_asesores text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primero text;
begin
  if not public.app_is_admin() then
    raise exception 'Solo administracion puede asignar asesores.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.usuarios where id_usuario = p_usuario_id) then
    raise exception 'El usuario no existe.';
  end if;

  delete from public.usuarios_asesores where id_usuario = p_usuario_id;

  insert into public.usuarios_asesores (id_usuario, asesor, created_by)
  select p_usuario_id, asesor, auth.uid()
  from (
    select distinct upper(btrim(valor)) as asesor
    from unnest(coalesce(p_asesores, array[]::text[])) as valor
    where btrim(valor) <> ''
  ) normalizados;

  select ua.asesor into v_primero
  from public.usuarios_asesores ua
  where ua.id_usuario = p_usuario_id
  order by ua.id
  limit 1;

  -- Se mantiene la columna anterior como compatibilidad con versiones previas.
  update public.usuarios
  set asesor_asignado = v_primero, updated_at = now()
  where id_usuario = p_usuario_id;
end;
$$;

-- Un usuario sin asignaciones puede reclamar una sola. Las adicionales siempre
-- las configura administracion desde USUARIOS.
create or replace function public.app_claim_asesor(p_asesor text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asesor text;
begin
  v_asesor := upper(btrim(coalesce(p_asesor, '')));
  if v_asesor = '' then
    raise exception 'Debes capturar un asesor valido.';
  end if;
  if not exists (select 1 from public.usuarios where id_usuario = auth.uid()) then
    raise exception 'Tu usuario no existe en el padron.';
  end if;
  if exists (select 1 from public.usuarios_asesores where id_usuario = auth.uid()) then
    raise exception 'Tu usuario ya tiene asesor asignado.';
  end if;

  insert into public.usuarios_asesores (id_usuario, asesor, created_by)
  values (auth.uid(), v_asesor, auth.uid());

  update public.usuarios
  set asesor_asignado = v_asesor, updated_at = now()
  where id_usuario = auth.uid();

  return v_asesor;
end;
$$;

drop trigger if exists trg_audit_usuarios_asesores on public.usuarios_asesores;
create trigger trg_audit_usuarios_asesores
after insert or update or delete on public.usuarios_asesores
for each row execute function public.audit_log_change();

revoke all on function public.set_usuario_asesores(uuid, text[]) from public;
revoke all on function public.app_claim_asesor(text) from public;
grant execute on function public.set_usuario_asesores(uuid, text[]) to authenticated;
grant execute on function public.app_claim_asesor(text) to authenticated;

-- Verificacion final visible en el editor SQL.
select
  u.usuario as correo,
  coalesce(array_agg(ua.asesor order by ua.asesor)
    filter (where ua.asesor is not null), array[]::text[]) as asesores
from public.usuarios u
left join public.usuarios_asesores ua on ua.id_usuario = u.id_usuario
where lower(coalesce(u.usuario, '')) like '%verovillafan%'
group by u.id_usuario, u.usuario;
