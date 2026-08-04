-- El proceso real requiere una sola intervencion de administracion:
-- Valeria revisa la solicitud y, al autorizarla, el reembolso queda procesado.
-- La forma y el desglose de entrega ya fueron capturados en la solicitud.

create or replace function public.resolver_reembolso(
  p_reembolso_id bigint,
  p_autorizar boolean,
  p_observaciones text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reembolso public.reembolsos%rowtype;
  v_saldo_actual numeric := 0;
begin
  if not public.app_is_admin() then
    raise exception 'Solo administracion puede autorizar o rechazar reembolsos.' using errcode = '42501';
  end if;

  select * into v_reembolso
  from public.reembolsos
  where id = p_reembolso_id
  for update;

  if not found or v_reembolso.estado <> 'solicitado' then
    raise exception 'La solicitud ya fue atendida o no existe.';
  end if;

  if not p_autorizar then
    update public.reembolsos
    set estado = 'rechazado', rechazado_por = auth.uid(), rechazado_at = now(),
        observaciones = coalesce(nullif(btrim(coalesce(p_observaciones, '')), ''), observaciones),
        updated_at = now()
    where id = p_reembolso_id;
    return;
  end if;

  if v_reembolso.forma_reembolso not in ('Efectivo', 'Deposito', 'Dividida') then
    raise exception 'La solicitud no tiene una forma de entrega valida.';
  end if;
  if round(coalesce(v_reembolso.reembolso_efectivo, 0)
      + coalesce(v_reembolso.reembolso_deposito, 0), 2)
     <> round(v_reembolso.monto, 2) then
    raise exception 'El desglose no coincide con el monto del reembolso.';
  end if;
  if (v_reembolso.forma_reembolso = 'Efectivo' and
      (round(coalesce(v_reembolso.reembolso_efectivo, 0), 2) <> round(v_reembolso.monto, 2)
       or coalesce(v_reembolso.reembolso_deposito, 0) <> 0))
     or (v_reembolso.forma_reembolso = 'Deposito' and
      (coalesce(v_reembolso.reembolso_efectivo, 0) <> 0
       or round(coalesce(v_reembolso.reembolso_deposito, 0), 2) <> round(v_reembolso.monto, 2)))
     or (v_reembolso.forma_reembolso = 'Dividida' and
      (coalesce(v_reembolso.reembolso_efectivo, 0) <= 0
       or coalesce(v_reembolso.reembolso_deposito, 0) <= 0)) then
    raise exception 'La forma de entrega no coincide con su desglose.';
  end if;

  if v_reembolso.origen_saldo > 0 then
    perform numero_consecutivo
    from public.operadores
    where numero_consecutivo = v_reembolso.operador_id
    for update;

    select coalesce(sum(importe), 0) into v_saldo_actual
    from public.operador_saldo_movimientos
    where operador_id = v_reembolso.operador_id;

    if round(v_reembolso.origen_saldo, 2) > round(v_saldo_actual, 2) then
      raise exception 'Saldo insuficiente. Disponible: %, descuento: %.',
        round(v_saldo_actual, 2), round(v_reembolso.origen_saldo, 2);
    end if;

    insert into public.operador_saldo_movimientos (
      operador_id, tipo, importe, fecha, concepto, venta_id, ticket_id
    ) values (
      v_reembolso.operador_id, 'reembolso', -v_reembolso.origen_saldo,
      (now() at time zone 'America/Mexico_City')::date,
      'Reembolso #' || v_reembolso.id,
      v_reembolso.venta_id, v_reembolso.ticket_id
    );
  end if;

  update public.reembolsos
  set estado = 'procesado', reembolso_saldo = 0,
      autorizado_por = auth.uid(), autorizado_at = now(),
      procesado_por = auth.uid(), procesado_at = now(),
      observaciones = coalesce(nullif(btrim(coalesce(p_observaciones, '')), ''), observaciones),
      updated_at = now()
  where id = p_reembolso_id;

  if v_reembolso.tipo = 'total' then
    update public.ventas
    set cancelado = true,
        motivo_cancelacion = 'REEMBOLSO TOTAL #' || v_reembolso.id,
        cancelado_at = now(), updated_at = now()
    where (v_reembolso.ticket_id is not null and ticket_id = v_reembolso.ticket_id)
       or (v_reembolso.venta_id is not null and id = v_reembolso.venta_id);
  end if;
end;
$$;

revoke all on function public.resolver_reembolso(bigint, boolean, text) from public;
grant execute on function public.resolver_reembolso(bigint, boolean, text) to authenticated;
