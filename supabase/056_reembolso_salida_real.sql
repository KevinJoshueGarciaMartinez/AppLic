-- Todo reembolso representa dinero entregado realmente al operador.
-- La forma de entrega (efectivo/deposito/dividida) se separa del origen del
-- pago. Cuando el origen fue saldo a favor, al procesar se descuenta del wallet.

alter table public.reembolsos
  add column if not exists origen_efectivo numeric(12,2) not null default 0,
  add column if not exists origen_deposito numeric(12,2) not null default 0,
  add column if not exists origen_saldo numeric(12,2) not null default 0;

-- Conserva el origen de los reembolsos creados con el modelo anterior.
update public.reembolsos
set origen_efectivo = reembolso_efectivo,
    origen_deposito = reembolso_deposito,
    origen_saldo = reembolso_saldo
where origen_efectivo = 0
  and origen_deposito = 0
  and origen_saldo = 0;

alter table public.reembolsos
  drop constraint if exists reembolsos_origen_total;
alter table public.reembolsos
  add constraint reembolsos_origen_total check (
    origen_efectivo >= 0
    and origen_deposito >= 0
    and origen_saldo >= 0
    and round(origen_efectivo + origen_deposito + origen_saldo, 2) = round(monto, 2)
  );

alter table public.reembolsos
  drop constraint if exists reembolsos_forma_reembolso_check;
alter table public.reembolsos
  drop constraint if exists reembolsos_desglose_total;
alter table public.reembolsos
  drop constraint if exists reembolsos_forma_desglose;
alter table public.reembolsos
  drop constraint if exists reembolsos_entrega_total;
alter table public.reembolsos
  drop constraint if exists reembolsos_forma_entrega;

-- NOT VALID permite conservar temporalmente solicitudes antiguas con forma
-- Saldo. Al procesarlas, la nueva funcion exige y guarda la entrega real.
alter table public.reembolsos
  add constraint reembolsos_entrega_total check (
    reembolso_efectivo >= 0
    and reembolso_deposito >= 0
    and reembolso_saldo >= 0
    and round(reembolso_efectivo + reembolso_deposito, 2) = round(monto, 2)
    and reembolso_saldo = 0
  ) not valid;

alter table public.reembolsos
  add constraint reembolsos_forma_entrega check (
    (forma_reembolso = 'Efectivo' and reembolso_efectivo = monto and reembolso_deposito = 0)
    or (forma_reembolso = 'Deposito' and reembolso_efectivo = 0 and reembolso_deposito = monto)
    or (forma_reembolso = 'Dividida' and reembolso_efectivo > 0 and reembolso_deposito > 0)
  ) not valid;

-- El signo del movimiento se controla dentro de la funcion transaccional.
alter table public.operador_saldo_movimientos
  drop constraint if exists operador_saldo_reembolso_pos;

create or replace function public.resumen_reembolsable(
  p_venta_id bigint default null,
  p_ticket_id bigint default null
)
returns table (
  pagado numeric,
  reservado numeric,
  procesado numeric,
  disponible numeric,
  disponible_efectivo numeric,
  disponible_deposito numeric,
  disponible_saldo numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pagado numeric := 0;
  v_efectivo numeric := 0;
  v_deposito numeric := 0;
  v_saldo numeric := 0;
  v_reservado numeric := 0;
  v_res_efectivo numeric := 0;
  v_res_deposito numeric := 0;
  v_res_saldo numeric := 0;
  v_procesado numeric := 0;
begin
  if (p_venta_id is null)::int + (p_ticket_id is null)::int <> 1 then
    raise exception 'Se requiere exactamente una venta o un ticket.';
  end if;
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para consultar reembolsos.' using errcode = '42501';
  end if;

  select coalesce(sum(vp.monto), 0), coalesce(sum(vp.pago_efectivo), 0),
         coalesce(sum(vp.pago_deposito), 0), coalesce(sum(vp.pago_saldo), 0)
  into v_pagado, v_efectivo, v_deposito, v_saldo
  from public.ventas_pagos vp
  where vp.cancelado = false
    and ((p_ticket_id is not null and vp.ticket_id = p_ticket_id)
      or (p_venta_id is not null and vp.venta_id = p_venta_id));

  select coalesce(sum(r.monto), 0), coalesce(sum(r.origen_efectivo), 0),
         coalesce(sum(r.origen_deposito), 0), coalesce(sum(r.origen_saldo), 0),
         coalesce(sum(r.monto) filter (where r.estado = 'procesado'), 0)
  into v_reservado, v_res_efectivo, v_res_deposito, v_res_saldo, v_procesado
  from public.reembolsos r
  where r.estado in ('solicitado', 'autorizado', 'procesado')
    and ((p_ticket_id is not null and r.ticket_id = p_ticket_id)
      or (p_venta_id is not null and r.venta_id = p_venta_id));

  return query select round(v_pagado, 2), round(v_reservado, 2),
    round(v_procesado, 2), greatest(round(v_pagado - v_reservado, 2), 0),
    greatest(round(v_efectivo - v_res_efectivo, 2), 0),
    greatest(round(v_deposito - v_res_deposito, 2), 0),
    greatest(round(v_saldo - v_res_saldo, 2), 0);
end;
$$;

create or replace function public.solicitar_reembolso(
  p_venta_id bigint,
  p_ticket_id bigint,
  p_monto numeric,
  p_forma_reembolso text,
  p_reembolso_efectivo numeric,
  p_reembolso_deposito numeric,
  p_reembolso_saldo numeric,
  p_motivo text,
  p_observaciones text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reembolso_id bigint;
  v_operador_id bigint;
  v_restante numeric;
  v_aplicar numeric;
  v_pagado numeric;
  v_reservado numeric;
  v_disponible numeric;
  v_disp_efectivo numeric;
  v_disp_deposito numeric;
  v_disp_saldo numeric;
  v_origen_efectivo numeric := 0;
  v_origen_deposito numeric := 0;
  v_origen_saldo numeric := 0;
  v_tipo text;
  v_pago record;
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para solicitar reembolsos.' using errcode = '42501';
  end if;
  if (p_venta_id is null)::int + (p_ticket_id is null)::int <> 1 then
    raise exception 'Se requiere exactamente una venta o un ticket.';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del reembolso debe ser mayor a cero.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo debe contener al menos 5 caracteres.';
  end if;
  if p_forma_reembolso not in ('Efectivo', 'Deposito', 'Dividida') then
    raise exception 'La entrega debe ser en efectivo, deposito o dividida.';
  end if;
  if coalesce(p_reembolso_saldo, 0) <> 0
     or round(coalesce(p_reembolso_efectivo, 0) + coalesce(p_reembolso_deposito, 0), 2)
        <> round(p_monto, 2) then
    raise exception 'El desglose de entrega no coincide con el reembolso.';
  end if;
  if (p_forma_reembolso = 'Efectivo' and
      (round(coalesce(p_reembolso_efectivo, 0), 2) <> round(p_monto, 2)
       or coalesce(p_reembolso_deposito, 0) <> 0))
     or (p_forma_reembolso = 'Deposito' and
      (coalesce(p_reembolso_efectivo, 0) <> 0
       or round(coalesce(p_reembolso_deposito, 0), 2) <> round(p_monto, 2)))
     or (p_forma_reembolso = 'Dividida' and
      (coalesce(p_reembolso_efectivo, 0) <= 0 or coalesce(p_reembolso_deposito, 0) <= 0)) then
    raise exception 'La forma de entrega no coincide con su desglose.';
  end if;

  perform vp.id from public.ventas_pagos vp
  where vp.cancelado = false
    and ((p_ticket_id is not null and vp.ticket_id = p_ticket_id)
      or (p_venta_id is not null and vp.venta_id = p_venta_id))
  for update;

  if p_ticket_id is not null then
    if not exists (select 1 from public.ventas where ticket_id = p_ticket_id) then
      raise exception 'El ticket no existe.';
    end if;
    select min(operador_id) into v_operador_id from public.ventas where ticket_id = p_ticket_id;
  else
    select operador_id into v_operador_id from public.ventas where id = p_venta_id;
    if not found then raise exception 'La venta no existe.'; end if;
  end if;

  select * into v_pagado, v_reservado, v_aplicar, v_disponible,
    v_disp_efectivo, v_disp_deposito, v_disp_saldo
  from public.resumen_reembolsable(p_venta_id, p_ticket_id);
  if round(p_monto, 2) > round(v_disponible, 2) then
    raise exception 'El reembolso excede el monto disponible de %.', v_disponible;
  end if;

  -- El origen se determina automaticamente. Se consume saldo primero para
  -- reflejar el dinero que se entrega fuera del wallet.
  v_restante := round(p_monto, 2);
  v_origen_saldo := least(v_restante, v_disp_saldo);
  v_restante := round(v_restante - v_origen_saldo, 2);
  v_origen_deposito := least(v_restante, v_disp_deposito);
  v_restante := round(v_restante - v_origen_deposito, 2);
  v_origen_efectivo := least(v_restante, v_disp_efectivo);
  v_restante := round(v_restante - v_origen_efectivo, 2);
  if v_restante > 0 then raise exception 'No fue posible determinar el origen del reembolso.'; end if;
  if v_origen_saldo > 0 and v_operador_id is null then
    raise exception 'El ticket necesita un operador para descontar saldo.';
  end if;

  v_tipo := case when round(v_reservado + p_monto, 2) = round(v_pagado, 2)
    then 'total' else 'parcial' end;

  insert into public.reembolsos (
    venta_id, ticket_id, operador_id, tipo, monto, forma_reembolso,
    reembolso_efectivo, reembolso_deposito, reembolso_saldo,
    origen_efectivo, origen_deposito, origen_saldo,
    motivo, observaciones, idempotency_key, solicitado_por
  ) values (
    p_venta_id, p_ticket_id, v_operador_id, v_tipo, round(p_monto, 2), p_forma_reembolso,
    round(coalesce(p_reembolso_efectivo, 0), 2),
    round(coalesce(p_reembolso_deposito, 0), 2), 0,
    round(v_origen_efectivo, 2), round(v_origen_deposito, 2), round(v_origen_saldo, 2),
    btrim(p_motivo), nullif(btrim(coalesce(p_observaciones, '')), ''),
    p_idempotency_key, auth.uid()
  ) returning id into v_reembolso_id;

  v_restante := round(p_monto, 2);
  for v_pago in
    select vp.id, greatest(vp.monto - coalesce((
      select sum(rp.monto) from public.reembolso_pagos rp
      join public.reembolsos r on r.id = rp.reembolso_id
      where rp.venta_pago_id = vp.id
        and r.estado in ('solicitado', 'autorizado', 'procesado')
    ), 0), 0) as disponible
    from public.ventas_pagos vp
    where vp.cancelado = false
      and ((p_ticket_id is not null and vp.ticket_id = p_ticket_id)
        or (p_venta_id is not null and vp.venta_id = p_venta_id))
    order by vp.created_at, vp.id
  loop
    exit when v_restante <= 0;
    v_aplicar := least(v_restante, v_pago.disponible);
    if v_aplicar > 0 then
      insert into public.reembolso_pagos(reembolso_id, venta_pago_id, monto)
      values (v_reembolso_id, v_pago.id, round(v_aplicar, 2));
      v_restante := round(v_restante - v_aplicar, 2);
    end if;
  end loop;
  if v_restante > 0 then raise exception 'No fue posible reservar todo el reembolso.'; end if;
  return v_reembolso_id;
end;
$$;

-- La firma anterior queda bloqueada para impedir que una version vieja de la
-- interfaz vuelva a acreditar saldo por error.
create or replace function public.procesar_reembolso(p_reembolso_id bigint, p_referencia text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Actualiza la aplicacion antes de procesar este reembolso.';
end;
$$;

create or replace function public.procesar_reembolso(
  p_reembolso_id bigint,
  p_forma_reembolso text,
  p_reembolso_efectivo numeric,
  p_reembolso_deposito numeric,
  p_referencia text default null
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
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para procesar reembolsos.' using errcode = '42501';
  end if;
  select * into v_reembolso from public.reembolsos
  where id = p_reembolso_id for update;
  if not found then raise exception 'El reembolso no existe.'; end if;
  if v_reembolso.estado <> 'autorizado' then
    raise exception 'El reembolso debe estar autorizado antes de procesarse.';
  end if;
  if p_forma_reembolso not in ('Efectivo', 'Deposito', 'Dividida') then
    raise exception 'La entrega debe ser en efectivo, deposito o dividida.';
  end if;
  if round(coalesce(p_reembolso_efectivo, 0) + coalesce(p_reembolso_deposito, 0), 2)
     <> round(v_reembolso.monto, 2) then
    raise exception 'El desglose no coincide con el monto del reembolso.';
  end if;
  if (p_forma_reembolso = 'Efectivo' and
      (round(coalesce(p_reembolso_efectivo, 0), 2) <> round(v_reembolso.monto, 2)
       or coalesce(p_reembolso_deposito, 0) <> 0))
     or (p_forma_reembolso = 'Deposito' and
      (coalesce(p_reembolso_efectivo, 0) <> 0
       or round(coalesce(p_reembolso_deposito, 0), 2) <> round(v_reembolso.monto, 2)))
     or (p_forma_reembolso = 'Dividida' and
      (coalesce(p_reembolso_efectivo, 0) <= 0 or coalesce(p_reembolso_deposito, 0) <= 0)) then
    raise exception 'La forma de entrega no coincide con su desglose.';
  end if;
  if coalesce(p_reembolso_deposito, 0) > 0
     and length(btrim(coalesce(p_referencia, ''))) < 3 then
    raise exception 'La referencia bancaria es obligatoria.';
  end if;

  if v_reembolso.origen_saldo > 0 then
    perform numero_consecutivo from public.operadores
    where numero_consecutivo = v_reembolso.operador_id for update;
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
  set estado = 'procesado', forma_reembolso = p_forma_reembolso,
      reembolso_efectivo = round(coalesce(p_reembolso_efectivo, 0), 2),
      reembolso_deposito = round(coalesce(p_reembolso_deposito, 0), 2),
      reembolso_saldo = 0,
      referencia = nullif(btrim(coalesce(p_referencia, '')), ''),
      procesado_por = auth.uid(), procesado_at = now(), updated_at = now()
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

revoke all on function public.procesar_reembolso(bigint, text, numeric, numeric, text) from public;
grant execute on function public.procesar_reembolso(bigint, text, numeric, numeric, text) to authenticated;
