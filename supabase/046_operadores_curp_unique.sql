-- Evita registrar dos operadores con la misma CURP.
-- Se normaliza con trim + uppercase para cubrir diferencias de espacios o mayúsculas.

do $$
begin
  if exists (
    select 1
    from (
      select upper(btrim(curp)) as curp_normalizada
      from public.operadores
      where curp is not null
        and btrim(curp) <> ''
      group by upper(btrim(curp))
      having count(*) > 1
    ) duplicados
  ) then
    raise exception
      'No se puede aplicar la restricción única de CURP porque ya existen operadores duplicados.';
  end if;
end
$$;

create unique index if not exists uq_operadores_curp_normalizada
  on public.operadores ((upper(btrim(curp))))
  where curp is not null
    and btrim(curp) <> '';
