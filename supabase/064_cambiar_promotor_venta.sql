-- Cambia el promotor de una venta o ticket historico de forma atomica.
-- Se bloquea si alguna linea ya tiene la comision pagada.

create or replace function public.cambiar_promotor_venta(
  p_venta_id bigint,
  p_promotor_id bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id bigint;
  v_promotor_nombre text;
  v_actualizadas integer := 0;
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para cambiar el promotor de una venta.' using errcode = '42501';
  end if;

  select v.ticket_id
  into v_ticket_id
  from public.ventas v
  where v.id = p_venta_id;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select p.nombre
  into v_promotor_nombre
  from public.promotores p
  where p.id_promotor = p_promotor_id;

  if not found then
    raise exception 'El promotor seleccionado no existe.';
  end if;

  -- Bloquea todas las lineas afectadas hasta terminar la validacion y cambio.
  perform v.id
  from public.ventas v
  where (v_ticket_id is not null and v.ticket_id = v_ticket_id)
     or (v_ticket_id is null and v.id = p_venta_id)
  order by v.id
  for update;

  if exists (
    select 1
    from public.ventas v
    where ((v_ticket_id is not null and v.ticket_id = v_ticket_id)
       or (v_ticket_id is null and v.id = p_venta_id))
      and v.comision_pagada = true
  ) then
    raise exception 'NO SE PUEDE CAMBIAR EL PROMOTOR PORQUE LA COMISION YA FUE PAGADA.';
  end if;

  if exists (
    select 1
    from public.ventas v
    where ((v_ticket_id is not null and v.ticket_id = v_ticket_id)
       or (v_ticket_id is null and v.id = p_venta_id))
      and v.cancelado = true
  ) then
    raise exception 'NO SE PUEDE CAMBIAR EL PROMOTOR DE UNA VENTA CANCELADA.';
  end if;

  update public.ventas v
  set id_promotor = p_promotor_id,
      promotor = v_promotor_nombre,
      updated_at = now()
  where (v_ticket_id is not null and v.ticket_id = v_ticket_id)
     or (v_ticket_id is null and v.id = p_venta_id);

  get diagnostics v_actualizadas = row_count;
  return v_actualizadas;
end;
$$;

revoke all on function public.cambiar_promotor_venta(bigint, bigint) from public;
grant execute on function public.cambiar_promotor_venta(bigint, bigint) to authenticated;
