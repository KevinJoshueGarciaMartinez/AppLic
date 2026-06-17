-- Renombra servicios MNP directamente en BD para evitar traducciones en frontend.

update public.catalogo_servicios_costos
set servicio = 'MNP'
where trim(servicio) = 'Medico MNP';

update public.catalogo_servicios_costos
set servicio = 'Liquidacion de MNP'
where trim(servicio) = 'Liquidacion medico MNP';

update public.ventas
set servicio = 'MNP'
where trim(servicio) = 'Medico MNP';

update public.ventas
set servicio = 'Liquidacion de MNP'
where trim(servicio) = 'Liquidacion medico MNP';
