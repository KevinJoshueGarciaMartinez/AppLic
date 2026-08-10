-- Catalogo administrable de servicios.
-- Los servicios se desactivan en lugar de borrarse para conservar el historial.

alter table public.catalogo_servicios_costos
  add column if not exists activo boolean not null default true,
  add column if not exists costo_abierto boolean not null default false;

-- Conserva como abiertos los conceptos que anteriormente dependian de IDs en frontend.
update public.catalogo_servicios_costos
set costo_abierto = true,
    updated_at = now()
where id_servicio in (46, 57, 67, 78);

-- Cambio solicitado al catalogo vigente.
update public.catalogo_servicios_costos
set costo_base = 1500,
    updated_at = now()
where upper(trim(servicio)) = 'PRECHEQUEO';

do $$
declare
  v_next_id bigint;
  v_next_order integer;
begin
  perform pg_advisory_xact_lock(hashtext('catalogo_servicios_costos_nuevo_id'));

  select coalesce(max(id_servicio), 0) + 1,
         coalesce(max(orden), 0) + 1
    into v_next_id, v_next_order
  from public.catalogo_servicios_costos;

  if not exists (
    select 1 from public.catalogo_servicios_costos
    where upper(trim(servicio)) = 'MEDICO TERCERO AUTORIZADO'
  ) then
    insert into public.catalogo_servicios_costos (
      id_servicio, orden, servicio, tipo_servicio, costo_base, com_1,
      activo, costo_abierto
    ) values (
      v_next_id, v_next_order, 'MEDICO TERCERO AUTORIZADO', 1, 0, 0,
      true, true
    );
    v_next_id := v_next_id + 1;
    v_next_order := v_next_order + 1;
  else
    update public.catalogo_servicios_costos
    set activo = true, costo_abierto = true, updated_at = now()
    where upper(trim(servicio)) = 'MEDICO TERCERO AUTORIZADO';
  end if;

  if not exists (
    select 1 from public.catalogo_servicios_costos
    where upper(trim(servicio)) = 'LIQUIDACION MEDICO'
  ) then
    insert into public.catalogo_servicios_costos (
      id_servicio, orden, servicio, tipo_servicio, costo_base, com_1,
      activo, costo_abierto
    ) values (
      v_next_id, v_next_order, 'LIQUIDACION MEDICO', 1, 0, 0,
      true, true
    );
  else
    update public.catalogo_servicios_costos
    set activo = true, costo_abierto = true, updated_at = now()
    where upper(trim(servicio)) = 'LIQUIDACION MEDICO';
  end if;
end;
$$;

alter table public.catalogo_servicios_costos enable row level security;

drop policy if exists catalogo_servicios_select on public.catalogo_servicios_costos;
drop policy if exists catalogo_servicios_insert on public.catalogo_servicios_costos;
drop policy if exists catalogo_servicios_update on public.catalogo_servicios_costos;
drop policy if exists catalogo_servicios_delete on public.catalogo_servicios_costos;

create policy catalogo_servicios_select on public.catalogo_servicios_costos
for select to authenticated
using (public.app_is_admin() or public.app_is_recepcion());

-- Escritura exclusivamente mediante las funciones de administrador.
create policy catalogo_servicios_insert on public.catalogo_servicios_costos
for insert to authenticated with check (false);
create policy catalogo_servicios_update on public.catalogo_servicios_costos
for update to authenticated using (false) with check (false);
create policy catalogo_servicios_delete on public.catalogo_servicios_costos
for delete to authenticated using (false);

create or replace function public.guardar_catalogo_servicio(
  p_id_servicio bigint,
  p_servicio text,
  p_tipo_servicio integer,
  p_costo_base numeric,
  p_com_1 numeric,
  p_orden integer,
  p_costo_abierto boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_nombre text := upper(trim(coalesce(p_servicio, '')));
begin
  if not public.app_is_admin() then
    raise exception 'Solo un administrador puede modificar el catalogo de servicios';
  end if;
  if char_length(v_nombre) < 2 then
    raise exception 'Captura un nombre de servicio valido';
  end if;
  if coalesce(p_costo_base, 0) < 0 or coalesce(p_com_1, 0) < 0 then
    raise exception 'El costo y la comision no pueden ser negativos';
  end if;
  if exists (
    select 1 from public.catalogo_servicios_costos c
    where upper(trim(c.servicio)) = v_nombre
      and (p_id_servicio is null or c.id_servicio <> p_id_servicio)
  ) then
    raise exception 'Ya existe un servicio con ese nombre';
  end if;

  if p_id_servicio is null then
    perform pg_advisory_xact_lock(hashtext('catalogo_servicios_costos_nuevo_id'));
    select coalesce(max(id_servicio), 0) + 1 into v_id
    from public.catalogo_servicios_costos;

    insert into public.catalogo_servicios_costos (
      id_servicio, orden, servicio, tipo_servicio, costo_base, com_1,
      activo, costo_abierto
    ) values (
      v_id,
      greatest(coalesce(p_orden, 0), 0),
      v_nombre,
      p_tipo_servicio,
      case when coalesce(p_costo_abierto, false) then 0 else coalesce(p_costo_base, 0) end,
      coalesce(p_com_1, 0),
      true,
      coalesce(p_costo_abierto, false)
    );
  else
    update public.catalogo_servicios_costos
    set servicio = v_nombre,
        tipo_servicio = p_tipo_servicio,
        costo_base = case when coalesce(p_costo_abierto, false) then 0 else coalesce(p_costo_base, 0) end,
        com_1 = coalesce(p_com_1, 0),
        orden = greatest(coalesce(p_orden, 0), 0),
        costo_abierto = coalesce(p_costo_abierto, false),
        updated_at = now()
    where id_servicio = p_id_servicio
    returning id_servicio into v_id;

    if v_id is null then
      raise exception 'Servicio no encontrado';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.cambiar_estado_catalogo_servicio(
  p_id_servicio bigint,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Solo un administrador puede modificar el catalogo de servicios';
  end if;

  update public.catalogo_servicios_costos
  set activo = coalesce(p_activo, false), updated_at = now()
  where id_servicio = p_id_servicio;

  if not found then
    raise exception 'Servicio no encontrado';
  end if;
end;
$$;

revoke all on function public.guardar_catalogo_servicio(bigint, text, integer, numeric, numeric, integer, boolean) from public;
revoke all on function public.cambiar_estado_catalogo_servicio(bigint, boolean) from public;
grant execute on function public.guardar_catalogo_servicio(bigint, text, integer, numeric, numeric, integer, boolean) to authenticated;
grant execute on function public.cambiar_estado_catalogo_servicio(bigint, boolean) to authenticated;

drop trigger if exists trg_audit_catalogo_servicios on public.catalogo_servicios_costos;
create trigger trg_audit_catalogo_servicios
after insert or update or delete on public.catalogo_servicios_costos
for each row execute function public.audit_log_change();
