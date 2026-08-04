-- Corrige el reembolso #2 que fue procesado por el modelo anterior como un
-- credito de saldo. La entrega real debe disminuir el wallet.
do $$
declare
  v_movimiento_id bigint;
  v_saldo_final numeric;
begin
  select m.id into v_movimiento_id
  from public.operador_saldo_movimientos m
  join public.reembolsos r
    on r.id = 2
   and r.operador_id = m.operador_id
   and r.ticket_id = m.ticket_id
  where m.operador_id = 677
    and m.tipo = 'reembolso'
    and m.concepto = 'Reembolso #2'
    and m.importe = 6500
    and r.estado = 'procesado'
    and r.origen_saldo = 6500
  for update of m;

  if v_movimiento_id is not null then
    update public.operador_saldo_movimientos
    set importe = -6500
    where id = v_movimiento_id;

    select coalesce(sum(importe), 0) into v_saldo_final
    from public.operador_saldo_movimientos
    where operador_id = 677;

    if round(v_saldo_final, 2) <> 9600 then
      raise exception 'La correccion no produjo el saldo esperado de 9600. Resultado: %.',
        round(v_saldo_final, 2);
    end if;
  end if;
end;
$$;

-- Permite completar la forma de entrega de reembolsos procesados por el
-- modelo anterior. No genera ningun movimiento adicional.
create or replace function public.completar_entrega_reembolso(
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
begin
  if not (public.app_is_admin() or public.app_is_recepcion()) then
    raise exception 'No tienes permiso para completar este reembolso.' using errcode = '42501';
  end if;

  select * into v_reembolso
  from public.reembolsos
  where id = p_reembolso_id
  for update;

  if not found then raise exception 'El reembolso no existe.'; end if;
  if v_reembolso.estado <> 'procesado' or v_reembolso.forma_reembolso <> 'Saldo' then
    raise exception 'El reembolso no requiere completar la forma de entrega.';
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

  update public.reembolsos
  set forma_reembolso = p_forma_reembolso,
      reembolso_efectivo = round(coalesce(p_reembolso_efectivo, 0), 2),
      reembolso_deposito = round(coalesce(p_reembolso_deposito, 0), 2),
      reembolso_saldo = 0,
      referencia = nullif(btrim(coalesce(p_referencia, '')), ''),
      updated_at = now()
  where id = p_reembolso_id;
end;
$$;

revoke all on function public.completar_entrega_reembolso(bigint, text, numeric, numeric, text) from public;
grant execute on function public.completar_entrega_reembolso(bigint, text, numeric, numeric, text) to authenticated;
