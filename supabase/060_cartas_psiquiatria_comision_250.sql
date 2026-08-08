-- Ajusta solamente la comision de Cartas psiquiatria.
-- El precio vigente del servicio se conserva sin cambios.

update public.catalogo_servicios_costos
set
  com_1 = 250.00,
  updated_at = now()
where id_servicio = 66;

do $$
begin
  if not exists (
    select 1
    from public.catalogo_servicios_costos
    where id_servicio = 66
      and upper(btrim(servicio)) = 'CARTAS PSIQUIATRIA'
      and com_1 = 250.00
  ) then
    raise exception 'No se pudo actualizar la comision de Cartas psiquiatria.';
  end if;
end;
$$;
