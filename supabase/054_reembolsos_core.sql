-- Proceso de reembolsos de ventas y tickets.
-- Se conserva el pago original y se registra la salida de dinero por separado.

create table if not exists public.reembolsos (
  id                  bigint primary key generated always as identity,
  venta_id            bigint references public.ventas(id) on delete restrict,
  ticket_id           bigint references public.tickets(id) on delete restrict,
  operador_id         bigint references public.operadores(numero_consecutivo) on delete restrict,

  tipo                text not null check (tipo in ('total', 'parcial')),
  estado              text not null default 'solicitado'
                      check (estado in ('solicitado', 'autorizado', 'procesado', 'rechazado', 'anulado')),
  monto               numeric(12,2) not null check (monto > 0),
  forma_reembolso     text not null
                      check (forma_reembolso in ('Efectivo', 'Deposito', 'Saldo', 'Dividida')),
  reembolso_efectivo  numeric(12,2) not null default 0 check (reembolso_efectivo >= 0),
  reembolso_deposito  numeric(12,2) not null default 0 check (reembolso_deposito >= 0),
  reembolso_saldo     numeric(12,2) not null default 0 check (reembolso_saldo >= 0),

  motivo              text not null check (length(btrim(motivo)) >= 5),
  referencia          text,
  observaciones       text,
  idempotency_key     uuid not null default gen_random_uuid() unique,

  solicitado_por      uuid not null default auth.uid(),
  solicitado_at       timestamptz not null default now(),
  autorizado_por      uuid,
  autorizado_at       timestamptz,
  procesado_por       uuid,
  procesado_at        timestamptz,
  rechazado_por       uuid,
  rechazado_at        timestamptz,
  anulado_por         uuid,
  anulado_at          timestamptz,
  updated_at          timestamptz not null default now(),

  constraint reembolsos_one_link check (
    (venta_id is not null)::int + (ticket_id is not null)::int = 1
  ),
  constraint reembolsos_desglose_total check (
    round(reembolso_efectivo + reembolso_deposito + reembolso_saldo, 2) = round(monto, 2)
  ),
  constraint reembolsos_forma_desglose check (
    (forma_reembolso = 'Efectivo' and reembolso_efectivo = monto and reembolso_deposito = 0 and reembolso_saldo = 0)
    or (forma_reembolso = 'Deposito' and reembolso_efectivo = 0 and reembolso_deposito = monto and reembolso_saldo = 0)
    or (forma_reembolso = 'Saldo' and reembolso_efectivo = 0 and reembolso_deposito = 0 and reembolso_saldo = monto)
    or (forma_reembolso = 'Dividida' and
        (reembolso_efectivo > 0)::int + (reembolso_deposito > 0)::int + (reembolso_saldo > 0)::int >= 2)
  )
);

-- Aplicaciones del reembolso contra los pagos originales.
-- Permite probar que nunca se reembolse mas de lo realmente cobrado.
create table if not exists public.reembolso_pagos (
  id              bigint primary key generated always as identity,
  reembolso_id    bigint not null references public.reembolsos(id) on delete cascade,
  venta_pago_id   bigint not null references public.ventas_pagos(id) on delete restrict,
  monto           numeric(12,2) not null check (monto > 0),
  created_at      timestamptz not null default now(),
  unique (reembolso_id, venta_pago_id)
);

create index if not exists idx_reembolsos_venta on public.reembolsos(venta_id);
create index if not exists idx_reembolsos_ticket on public.reembolsos(ticket_id);
create index if not exists idx_reembolsos_estado_fecha
  on public.reembolsos(estado, solicitado_at desc);
create index if not exists idx_reembolso_pagos_pago on public.reembolso_pagos(venta_pago_id);

-- El saldo devuelto al monedero se distingue de la devolucion tecnica que hace
-- la cancelacion antigua cuando revierte saldo previamente utilizado.
alter table public.operador_saldo_movimientos
  drop constraint if exists operador_saldo_movimientos_tipo_check;

alter table public.operador_saldo_movimientos
  add constraint operador_saldo_movimientos_tipo_check
  check (tipo in ('abono', 'aplicacion_ticket', 'devolucion_cancelacion', 'reembolso'));

alter table public.operador_saldo_movimientos
  drop constraint if exists operador_saldo_reembolso_pos;

alter table public.operador_saldo_movimientos
  add constraint operador_saldo_reembolso_pos check (
    tipo <> 'reembolso' or importe > 0
  );

alter table public.reembolsos enable row level security;
alter table public.reembolso_pagos enable row level security;

drop policy if exists reembolsos_select on public.reembolsos;
drop policy if exists reembolsos_insert on public.reembolsos;
drop policy if exists reembolsos_update on public.reembolsos;
drop policy if exists reembolsos_delete on public.reembolsos;

create policy reembolsos_select on public.reembolsos
for select using (public.app_is_admin() or public.app_is_recepcion());

-- Las escrituras directas se bloquean. Los cambios pasan por las funciones
-- transaccionales definidas abajo.
create policy reembolsos_insert on public.reembolsos for insert with check (false);
create policy reembolsos_update on public.reembolsos for update using (false) with check (false);
create policy reembolsos_delete on public.reembolsos for delete using (false);

drop policy if exists reembolso_pagos_select on public.reembolso_pagos;
drop policy if exists reembolso_pagos_insert on public.reembolso_pagos;
drop policy if exists reembolso_pagos_update on public.reembolso_pagos;
drop policy if exists reembolso_pagos_delete on public.reembolso_pagos;

create policy reembolso_pagos_select on public.reembolso_pagos
for select using (public.app_is_admin() or public.app_is_recepcion());

create policy reembolso_pagos_insert on public.reembolso_pagos for insert with check (false);
create policy reembolso_pagos_update on public.reembolso_pagos for update using (false) with check (false);
create policy reembolso_pagos_delete on public.reembolso_pagos for delete using (false);

grant select on public.reembolsos, public.reembolso_pagos to authenticated;

-- Devuelve los importes que usara la interfaz para habilitar un reembolso.
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

  select
    coalesce(sum(vp.monto), 0),
    coalesce(sum(vp.pago_efectivo), 0),
    coalesce(sum(vp.pago_deposito), 0),
    coalesce(sum(vp.pago_saldo), 0)
  into v_pagado, v_efectivo, v_deposito, v_saldo
  from public.ventas_pagos vp
  where vp.cancelado = false
    and ((p_ticket_id is not null and vp.ticket_id = p_ticket_id)
      or (p_venta_id is not null and vp.venta_id = p_venta_id));

  select
    coalesce(sum(r.monto), 0),
    coalesce(sum(r.reembolso_efectivo), 0),
    coalesce(sum(r.reembolso_deposito), 0),
    coalesce(sum(r.reembolso_saldo), 0),
    coalesce(sum(r.monto) filter (where r.estado = 'procesado'), 0)
  into v_reservado, v_res_efectivo, v_res_deposito, v_res_saldo, v_procesado
  from public.reembolsos r
  where r.estado in ('solicitado', 'autorizado', 'procesado')
    and ((p_ticket_id is not null and r.ticket_id = p_ticket_id)
      or (p_venta_id is not null and r.venta_id = p_venta_id));

  return query select
    round(v_pagado, 2),
    round(v_reservado, 2),
    round(v_procesado, 2),
    greatest(round(v_pagado - v_reservado, 2), 0),
    greatest(round(v_efectivo - v_res_efectivo, 2), 0),
    greatest(round(v_deposito - v_res_deposito, 2), 0),
    greatest(round(v_saldo - v_res_saldo, 2), 0);
end;
$$;

-- Recepcion o administracion crea la solicitud. En la misma transaccion se
-- reserva el monto contra los pagos originales, del mas antiguo al mas nuevo.
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
  if round(coalesce(p_reembolso_efectivo, 0) + coalesce(p_reembolso_deposito, 0) + coalesce(p_reembolso_saldo, 0), 2)
      <> round(p_monto, 2) then
    raise exception 'El desglose no coincide con el monto del reembolso.';
  end if;

  -- Bloquea los pagos relacionados para serializar solicitudes simultaneas.
  perform vp.id
  from public.ventas_pagos vp
  where vp.cancelado = false
    and ((p_ticket_id is not null and vp.ticket_id = p_ticket_id)
      or (p_venta_id is not null and vp.venta_id = p_venta_id))
  for update;

  if p_ticket_id is not null then
    if not exists (select 1 from public.ventas where ticket_id = p_ticket_id) then
      raise exception 'El ticket no existe.';
    end if;
    select min(operador_id) into v_operador_id
    from public.ventas where ticket_id = p_ticket_id;
  else
    select operador_id into v_operador_id
    from public.ventas where id = p_venta_id;
    if not found then raise exception 'La venta no existe.'; end if;
  end if;

  select * into v_pagado, v_reservado, v_aplicar, v_disponible,
    v_disp_efectivo, v_disp_deposito, v_disp_saldo
  from public.resumen_reembolsable(p_venta_id, p_ticket_id);

  if round(p_monto, 2) > round(v_disponible, 2) then
    raise exception 'El reembolso excede el monto disponible de %.', v_disponible;
  end if;
  if round(coalesce(p_reembolso_efectivo, 0), 2) > round(v_disp_efectivo, 2)
     or round(coalesce(p_reembolso_deposito, 0), 2) > round(v_disp_deposito, 2)
     or round(coalesce(p_reembolso_saldo, 0), 2) > round(v_disp_saldo, 2) then
    raise exception 'El reembolso debe conservar los medios del pago original.';
  end if;
  if coalesce(p_reembolso_saldo, 0) > 0 and v_operador_id is null then
    raise exception 'El ticket necesita un operador para devolver saldo a favor.';
  end if;

  v_tipo := case
    when round(v_reservado + p_monto, 2) = round(v_pagado, 2) then 'total'
    else 'parcial'
  end;

  insert into public.reembolsos (
    venta_id, ticket_id, operador_id, tipo, monto, forma_reembolso,
    reembolso_efectivo, reembolso_deposito, reembolso_saldo,
    motivo, observaciones, idempotency_key, solicitado_por
  ) values (
    p_venta_id, p_ticket_id, v_operador_id, v_tipo, round(p_monto, 2), p_forma_reembolso,
    round(coalesce(p_reembolso_efectivo, 0), 2),
    round(coalesce(p_reembolso_deposito, 0), 2),
    round(coalesce(p_reembolso_saldo, 0), 2),
    btrim(p_motivo), nullif(btrim(coalesce(p_observaciones, '')), ''),
    p_idempotency_key, auth.uid()
  ) returning id into v_reembolso_id;

  v_restante := round(p_monto, 2);
  for v_pago in
    select
      vp.id,
      greatest(vp.monto - coalesce((
        select sum(rp.monto)
        from public.reembolso_pagos rp
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

  if v_restante > 0 then
    raise exception 'No fue posible reservar todo el reembolso.';
  end if;

  return v_reembolso_id;
end;
$$;

-- Solo administracion autoriza o rechaza una solicitud.
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
begin
  if not public.app_is_admin() then
    raise exception 'Solo administracion puede autorizar o rechazar reembolsos.' using errcode = '42501';
  end if;

  if p_autorizar then
    update public.reembolsos
    set estado = 'autorizado', autorizado_por = auth.uid(), autorizado_at = now(),
        observaciones = coalesce(nullif(btrim(coalesce(p_observaciones, '')), ''), observaciones),
        updated_at = now()
    where id = p_reembolso_id and estado = 'solicitado';
  else
    update public.reembolsos
    set estado = 'rechazado', rechazado_por = auth.uid(), rechazado_at = now(),
        observaciones = coalesce(nullif(btrim(coalesce(p_observaciones, '')), ''), observaciones),
        updated_at = now()
    where id = p_reembolso_id and estado = 'solicitado';
  end if;

  if not found then
    raise exception 'La solicitud ya fue atendida o no existe.';
  end if;
end;
$$;

-- Registra la salida real. Si una parte vuelve al monedero, el abono se crea
-- dentro de esta misma transaccion.
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
      current_date,
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
end;
$$;

-- Una solicitud se puede anular antes de entregar dinero. Un reembolso ya
-- procesado nunca se borra ni se revierte silenciosamente.
create or replace function public.anular_reembolso(p_reembolso_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para anular solicitudes.' using errcode = '42501';
  end if;

  update public.reembolsos
  set estado = 'anulado', anulado_por = auth.uid(), anulado_at = now(), updated_at = now()
  where id = p_reembolso_id
    and estado in ('solicitado', 'autorizado')
    and (public.app_is_admin() or solicitado_por = auth.uid());

  if not found then
    raise exception 'El reembolso ya fue procesado, atendido o no puede ser anulado por este usuario.';
  end if;
end;
$$;

revoke all on function public.resumen_reembolsable(bigint, bigint) from public;
revoke all on function public.solicitar_reembolso(bigint, bigint, numeric, text, numeric, numeric, numeric, text, text, uuid) from public;
revoke all on function public.resolver_reembolso(bigint, boolean, text) from public;
revoke all on function public.procesar_reembolso(bigint, text) from public;
revoke all on function public.anular_reembolso(bigint) from public;

grant execute on function public.resumen_reembolsable(bigint, bigint) to authenticated;
grant execute on function public.solicitar_reembolso(bigint, bigint, numeric, text, numeric, numeric, numeric, text, text, uuid) to authenticated;
grant execute on function public.resolver_reembolso(bigint, boolean, text) to authenticated;
grant execute on function public.procesar_reembolso(bigint, text) to authenticated;
grant execute on function public.anular_reembolso(bigint) to authenticated;

drop trigger if exists trg_audit_reembolsos on public.reembolsos;
create trigger trg_audit_reembolsos
after insert or update or delete on public.reembolsos
for each row execute function public.audit_log_change();

drop trigger if exists trg_audit_reembolso_pagos on public.reembolso_pagos;
create trigger trg_audit_reembolso_pagos
after insert or update or delete on public.reembolso_pagos
for each row execute function public.audit_log_change();
