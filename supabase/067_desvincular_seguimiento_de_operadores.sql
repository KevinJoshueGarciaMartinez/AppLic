-- Seguimiento y operacion contable funcionan como flujos independientes.
-- La proteccion por nombre solo evita prospectos duplicados en Seguimiento.
-- Los operadores formales continuan protegidos por la restriccion unica de CURP.

create or replace function public.app_prevenir_operador_nombre_duplicado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_normalizado text;
  v_existente_id bigint;
begin
  -- Un operador contable puede tener el mismo nombre que un prospecto.
  if not coalesce(new.es_prospecto, false) then
    return new;
  end if;

  v_nombre_normalizado := public.app_normalizar_nombre_operador(
    new.nombre,
    new.apellido_paterno,
    new.apellido_materno
  );

  if v_nombre_normalizado = '' then
    raise exception 'CAPTURA EL NOMBRE DEL PROSPECTO.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and coalesce(old.es_prospecto, false)
    and v_nombre_normalizado = public.app_normalizar_nombre_operador(
      old.nombre,
      old.apellido_paterno,
      old.apellido_materno
    )
  then
    return new;
  end if;

  select o.numero_consecutivo
    into v_existente_id
  from public.operadores o
  where o.es_prospecto = true
    and o.numero_consecutivo <> coalesce(new.numero_consecutivo, -1)
    and public.app_normalizar_nombre_operador(
      o.nombre,
      o.apellido_paterno,
      o.apellido_materno
    ) = v_nombre_normalizado
  order by o.numero_consecutivo
  limit 1;

  if found then
    raise exception '%', format(
      'YA EXISTE UN PROSPECTO CON ESE NOMBRE (FOLIO #%s). REVISA EL REGISTRO ANTES DE CREAR OTRO.',
      v_existente_id
    ) using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.app_prevenir_operador_nombre_duplicado() from public;

drop trigger if exists trg_prevenir_operador_nombre_duplicado on public.operadores;
create trigger trg_prevenir_operador_nombre_duplicado
before insert or update of nombre, apellido_paterno, apellido_materno, es_prospecto
on public.operadores
for each row
execute function public.app_prevenir_operador_nombre_duplicado();
