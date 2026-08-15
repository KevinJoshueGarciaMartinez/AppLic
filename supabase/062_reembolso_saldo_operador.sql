-- Permite solicitar la devolucion de saldo a favor sin crear una venta ficticia.
-- Recepcion captura la solicitud y administracion la autoriza una sola vez.

alter table public.reembolsos
  drop constraint if exists reembolsos_one_link;

alter table public.reembolsos
  add constraint reembolsos_one_link check (
    ((venta_id is not null)::int + (ticket_id is not null)::int = 1)
    or (venta_id is null and ticket_id is null and operador_id is not null)
  );

create index if not exists idx_reembolsos_operador
  on public.reembolsos(operador_id, solicitado_at desc);

create or replace function public.resumen_reembolsable_saldo_operador(
  p_operador_id bigint
)
returns table (
  saldo numeric,
  reservado numeric,
  disponible numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_saldo numeric := 0;
  v_reservado numeric := 0;
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para consultar reembolsos.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.operadores where numero_consecutivo = p_operador_id
  ) then
    raise exception 'El operador no existe.';
  end if;

  select coalesce(sum(m.importe), 0)
  into v_saldo
  from public.operador_saldo_movimientos m
  where m.operador_id = p_operador_id;

  -- Solo se apartan solicitudes pendientes. Un reembolso procesado ya se
  -- encuentra descontado como movimiento negativo en el saldo del operador.
  select coalesce(sum(r.origen_saldo), 0)
  into v_reservado
  from public.reembolsos r
  where r.operador_id = p_operador_id
    and r.estado in ('solicitado', 'autorizado');

  return query select
    round(v_saldo, 2),
    round(v_reservado, 2),
    greatest(round(v_saldo - v_reservado, 2), 0);
end;
$$;

create or replace function public.solicitar_reembolso_saldo_operador(
  p_operador_id bigint,
  p_monto numeric,
  p_forma_reembolso text,
  p_reembolso_efectivo numeric,
  p_reembolso_deposito numeric,
  p_motivo text,
  p_referencia text default null,
  p_observaciones text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_saldo numeric := 0;
  v_reservado numeric := 0;
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para solicitar reembolsos.' using errcode = '42501';
  end if;

  select id into v_id
  from public.reembolsos
  where idempotency_key = p_idempotency_key;

  if found then
    return v_id;
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;
  if p_forma_reembolso not in ('Efectivo', 'Deposito', 'Dividida') then
    raise exception 'La forma de entrega no es valida.';
  end if;
  if round(coalesce(p_reembolso_efectivo, 0) + coalesce(p_reembolso_deposito, 0), 2)
      <> round(p_monto, 2) then
    raise exception 'El desglose de entrega no coincide con el monto.';
  end if;
  if (p_forma_reembolso = 'Efectivo' and
      (round(coalesce(p_reembolso_efectivo, 0), 2) <> round(p_monto, 2)
       or coalesce(p_reembolso_deposito, 0) <> 0))
     or (p_forma_reembolso = 'Deposito' and
      (coalesce(p_reembolso_efectivo, 0) <> 0
       or round(coalesce(p_reembolso_deposito, 0), 2) <> round(p_monto, 2)))
     or (p_forma_reembolso = 'Dividida' and
      (coalesce(p_reembolso_efectivo, 0) <= 0
       or coalesce(p_reembolso_deposito, 0) <= 0)) then
    raise exception 'La forma de entrega no coincide con su desglose.';
  end if;
  if coalesce(p_reembolso_deposito, 0) > 0
     and length(btrim(coalesce(p_referencia, ''))) < 3 then
    raise exception 'Captura la referencia o comprobante de la transferencia.';
  end if;

  -- La fila del operador serializa solicitudes simultaneas para evitar que dos
  -- usuarios aparten el mismo saldo.
  perform numero_consecutivo
  from public.operadores
  where numero_consecutivo = p_operador_id
  for update;

  if not found then
    raise exception 'El operador no existe.';
  end if;

  select coalesce(sum(m.importe), 0)
  into v_saldo
  from public.operador_saldo_movimientos m
  where m.operador_id = p_operador_id;

  select coalesce(sum(r.origen_saldo), 0)
  into v_reservado
  from public.reembolsos r
  where r.operador_id = p_operador_id
    and r.estado in ('solicitado', 'autorizado');

  if round(p_monto, 2) > greatest(round(v_saldo - v_reservado, 2), 0) then
    raise exception 'Saldo insuficiente. Disponible para reembolso: %.',
      greatest(round(v_saldo - v_reservado, 2), 0);
  end if;

  insert into public.reembolsos (
    venta_id, ticket_id, operador_id, tipo, estado, monto,
    forma_reembolso, reembolso_efectivo, reembolso_deposito, reembolso_saldo,
    origen_efectivo, origen_deposito, origen_saldo,
    motivo, referencia, observaciones, idempotency_key, solicitado_por
  ) values (
    null, null, p_operador_id, 'parcial', 'solicitado', round(p_monto, 2),
    p_forma_reembolso, round(coalesce(p_reembolso_efectivo, 0), 2),
    round(coalesce(p_reembolso_deposito, 0), 2), 0,
    0, 0, round(p_monto, 2),
    btrim(p_motivo), nullif(btrim(coalesce(p_referencia, '')), ''),
    nullif(btrim(coalesce(p_observaciones, '')), ''), p_idempotency_key, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Al autorizar, el saldo se descuenta y se conserva como se entrego el dinero.
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
      operador_id, tipo, importe, fecha, forma_pago, pago_efectivo,
      pago_deposito, referencia, concepto, venta_id, ticket_id
    ) values (
      v_reembolso.operador_id, 'reembolso', -v_reembolso.origen_saldo,
      (now() at time zone 'America/Mexico_City')::date,
      v_reembolso.forma_reembolso, v_reembolso.reembolso_efectivo,
      v_reembolso.reembolso_deposito, v_reembolso.referencia,
      case
        when v_reembolso.venta_id is null and v_reembolso.ticket_id is null
          then 'Reembolso de saldo #' || v_reembolso.id
        else 'Reembolso #' || v_reembolso.id
      end,
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

revoke all on function public.resumen_reembolsable_saldo_operador(bigint) from public;
revoke all on function public.solicitar_reembolso_saldo_operador(bigint, numeric, text, numeric, numeric, text, text, text, uuid) from public;
revoke all on function public.resolver_reembolso(bigint, boolean, text) from public;

grant execute on function public.resumen_reembolsable_saldo_operador(bigint) to authenticated;
grant execute on function public.solicitar_reembolso_saldo_operador(bigint, numeric, text, numeric, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.resolver_reembolso(bigint, boolean, text) to authenticated;
