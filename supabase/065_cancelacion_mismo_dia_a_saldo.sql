-- Cancela atomically una venta/ticket del mismo dia y devuelve todo lo pagado
-- al saldo a favor del operador. Evita cancelaciones y creditos duplicados.

create or replace function public.cancelar_venta_mismo_dia(
  p_venta_id bigint,
  p_motivo text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id bigint;
  v_operador_id bigint;
  v_fecha date;
  v_cancelado boolean;
  v_total_pagado numeric(12,2) := 0;
  v_pago_efectivo numeric(12,2) := 0;
  v_pago_deposito numeric(12,2) := 0;
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para cancelar ventas.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Indica el motivo de cancelacion.';
  end if;

  select v.ticket_id
  into v_ticket_id
  from public.ventas v
  where v.id = p_venta_id;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  -- Bloquea todas las lineas del ticket antes de validar y modificar.
  perform v.id
  from public.ventas v
  where (v_ticket_id is not null and v.ticket_id = v_ticket_id)
     or (v_ticket_id is null and v.id = p_venta_id)
  order by v.id
  for update;

  select v.operador_id, v.fecha, v.cancelado
  into v_operador_id, v_fecha, v_cancelado
  from public.ventas v
  where v.id = p_venta_id;

  if v_cancelado then
    raise exception 'La venta ya esta cancelada.';
  end if;

  if v_fecha <> (now() at time zone 'America/Mexico_City')::date then
    raise exception 'Solo se pueden cancelar tickets registrados el mismo dia.';
  end if;

  if exists (
    select 1
    from public.ventas v
    where ((v_ticket_id is not null and v.ticket_id = v_ticket_id)
       or (v_ticket_id is null and v.id = p_venta_id))
      and v.cancelado = true
  ) then
    raise exception 'El ticket ya tiene lineas canceladas.';
  end if;

  if exists (
    select 1
    from public.reembolsos r
    where r.estado in ('solicitado', 'autorizado', 'procesado')
      and ((v_ticket_id is not null and r.ticket_id = v_ticket_id)
        or (v_ticket_id is null and r.venta_id = p_venta_id))
  ) then
    raise exception 'NO SE PUEDE CANCELAR: EL TICKET YA TIENE UN REEMBOLSO ACTIVO O PROCESADO.';
  end if;

  -- Bloquea los pagos vigentes para impedir que cambien durante la cancelacion.
  perform vp.id
  from public.ventas_pagos vp
  where vp.cancelado = false
    and ((v_ticket_id is not null and vp.ticket_id = v_ticket_id)
      or (v_ticket_id is null and vp.venta_id = p_venta_id))
  order by vp.id
  for update;

  select
    coalesce(sum(vp.monto), 0),
    coalesce(sum(vp.pago_efectivo), 0),
    coalesce(sum(vp.pago_deposito), 0)
  into v_total_pagado, v_pago_efectivo, v_pago_deposito
  from public.ventas_pagos vp
  where vp.cancelado = false
    and ((v_ticket_id is not null and vp.ticket_id = v_ticket_id)
      or (v_ticket_id is null and vp.venta_id = p_venta_id));

  update public.ventas v
  set cancelado = true,
      motivo_cancelacion = btrim(p_motivo),
      cancelado_at = now(),
      updated_at = now()
  where (v_ticket_id is not null and v.ticket_id = v_ticket_id)
     or (v_ticket_id is null and v.id = p_venta_id);

  update public.ventas_pagos vp
  set cancelado = true
  where vp.cancelado = false
    and ((v_ticket_id is not null and vp.ticket_id = v_ticket_id)
      or (v_ticket_id is null and vp.venta_id = p_venta_id));

  if v_total_pagado > 0 then
    insert into public.operador_saldo_movimientos (
      operador_id,
      tipo,
      importe,
      fecha,
      pago_efectivo,
      pago_deposito,
      concepto,
      venta_id,
      ticket_id
    ) values (
      v_operador_id,
      'devolucion_cancelacion',
      round(v_total_pagado, 2),
      v_fecha,
      round(v_pago_efectivo, 2),
      round(v_pago_deposito, 2),
      'DEVOLUCION POR CANCELACION DE TICKET',
      case when v_ticket_id is null then p_venta_id else null end,
      v_ticket_id
    );
  end if;

  return round(v_total_pagado, 2);
end;
$$;

revoke all on function public.cancelar_venta_mismo_dia(bigint, text) from public;
grant execute on function public.cancelar_venta_mismo_dia(bigint, text) to authenticated;
