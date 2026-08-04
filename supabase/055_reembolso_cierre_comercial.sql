-- Cierra comercialmente las ventas cuando se procesa el reembolso total.
-- Los pagos originales se conservan activos como evidencia historica y nunca
-- se genera una segunda devolucion de saldo.

create or replace function public.procesar_reembolso(
  p_reembolso_id bigint,
  p_referencia text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reembolso public.reembolsos%rowtype;
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para procesar reembolsos.' using errcode = '42501';
  end if;

  select * into v_reembolso
  from public.reembolsos
  where id = p_reembolso_id
  for update;

  if not found then raise exception 'El reembolso no existe.'; end if;
  if v_reembolso.estado <> 'autorizado' then
    raise exception 'El reembolso debe estar autorizado antes de procesarse.';
  end if;
  if v_reembolso.reembolso_deposito > 0
     and length(btrim(coalesce(p_referencia, v_reembolso.referencia, ''))) < 3 then
    raise exception 'La referencia bancaria es obligatoria.';
  end if;

  if v_reembolso.reembolso_saldo > 0 then
    insert into public.operador_saldo_movimientos (
      operador_id, tipo, importe, fecha, concepto, venta_id, ticket_id
    ) values (
      v_reembolso.operador_id,
      'reembolso',
      v_reembolso.reembolso_saldo,
      (now() at time zone 'America/Mexico_City')::date,
      'Reembolso #' || v_reembolso.id,
      v_reembolso.venta_id,
      v_reembolso.ticket_id
    );
  end if;

  update public.reembolsos
  set estado = 'procesado',
      referencia = coalesce(nullif(btrim(coalesce(p_referencia, '')), ''), referencia),
      procesado_por = auth.uid(), procesado_at = now(), updated_at = now()
  where id = p_reembolso_id;

  -- Un reembolso total devuelve todo lo efectivamente pagado. La venta queda
  -- cerrada para que el importe no siga apareciendo como deuda ni comision
  -- pendiente. No se cancelan ventas_pagos: son el origen auditable del dinero.
  if v_reembolso.tipo = 'total' then
    update public.ventas
    set cancelado = true,
        motivo_cancelacion = 'REEMBOLSO TOTAL #' || v_reembolso.id,
        cancelado_at = now(),
        updated_at = now()
    where (v_reembolso.ticket_id is not null and ticket_id = v_reembolso.ticket_id)
       or (v_reembolso.venta_id is not null and id = v_reembolso.venta_id);
  end if;
end;
$$;

revoke all on function public.procesar_reembolso(bigint, text) from public;
grant execute on function public.procesar_reembolso(bigint, text) to authenticated;

-- Aplica el mismo cierre a reembolsos totales procesados antes de esta mejora.
update public.ventas v
set cancelado = true,
    motivo_cancelacion = 'REEMBOLSO TOTAL #' || r.id,
    cancelado_at = coalesce(r.procesado_at, now()),
    updated_at = now()
from public.reembolsos r
where r.estado = 'procesado'
  and r.tipo = 'total'
  and v.cancelado = false
  and ((r.ticket_id is not null and v.ticket_id = r.ticket_id)
    or (r.venta_id is not null and v.id = r.venta_id));
