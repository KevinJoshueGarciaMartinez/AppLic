-- Evita crear dos prospectos/operadores con el mismo nombre completo.
--
-- La comparacion ignora mayusculas, acentos y espacios repetidos. Se revisa
-- toda la tabla, incluyendo prospectos activos y operadores formalizados.
-- Los duplicados historicos se conservan para no borrar expedientes ni notas;
-- esta migracion solamente impide crear nuevos duplicados.

create or replace function public.app_normalizar_nombre_operador(
  p_nombre text,
  p_apellido_paterno text,
  p_apellido_materno text
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select btrim(
    regexp_replace(
      translate(
        upper(
          concat_ws(
            ' ',
            nullif(btrim(p_nombre), ''),
            nullif(btrim(p_apellido_paterno), ''),
            nullif(btrim(p_apellido_materno), '')
          )
        ),
        'ÁÉÍÓÚÜÑ',
        'AEIOUUN'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create index if not exists idx_operadores_nombre_completo_normalizado
  on public.operadores (
    public.app_normalizar_nombre_operador(nombre, apellido_paterno, apellido_materno)
  );

create or replace function public.app_prevenir_operador_nombre_duplicado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_normalizado text;
  v_existente_id bigint;
  v_existente_es_prospecto boolean;
begin
  v_nombre_normalizado := public.app_normalizar_nombre_operador(
    new.nombre,
    new.apellido_paterno,
    new.apellido_materno
  );

  if v_nombre_normalizado = '' then
    raise exception 'CAPTURA EL NOMBRE DEL PROSPECTO.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and v_nombre_normalizado = public.app_normalizar_nombre_operador(
      old.nombre,
      old.apellido_paterno,
      old.apellido_materno
    )
  then
    return new;
  end if;

  select o.numero_consecutivo, o.es_prospecto
    into v_existente_id, v_existente_es_prospecto
  from public.operadores o
  where o.numero_consecutivo <> coalesce(new.numero_consecutivo, -1)
    and public.app_normalizar_nombre_operador(
      o.nombre,
      o.apellido_paterno,
      o.apellido_materno
    ) = v_nombre_normalizado
  order by o.numero_consecutivo
  limit 1;

  if found then
    raise exception '%', format(
      'YA EXISTE % CON ESE NOMBRE (FOLIO #%s). REVISA EL REGISTRO ANTES DE CREAR OTRO.',
      case when v_existente_es_prospecto then 'UN PROSPECTO' else 'UN OPERADOR' end,
      v_existente_id
    ) using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.app_prevenir_operador_nombre_duplicado() from public;

drop trigger if exists trg_prevenir_operador_nombre_duplicado on public.operadores;
create trigger trg_prevenir_operador_nombre_duplicado
before insert or update of nombre, apellido_paterno, apellido_materno
on public.operadores
for each row
execute function public.app_prevenir_operador_nombre_duplicado();

-- Consulta de diagnostico: muestra duplicados historicos sin modificarlos.
-- select
--   public.app_normalizar_nombre_operador(nombre, apellido_paterno, apellido_materno) as nombre,
--   array_agg(numero_consecutivo order by numero_consecutivo) as folios
-- from public.operadores
-- group by 1
-- having count(*) > 1;
