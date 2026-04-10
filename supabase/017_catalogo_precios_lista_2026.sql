-- Precios de venta y comisión gestor (lista abril 2026).
-- costo_base = precio al público; com_1 = comisión gestor.

-- ── Servicios existentes ─────────────────────────────────────────────────────

update public.catalogo_servicios_costos
set
  servicio    = 'Prechequeo',
  costo_base  = 1000.00,
  precio_3    = 1000.00,
  precio_4    = 1000.00,
  precio_5    = 1000.00,
  precio_6    = 0,
  com_1       = 0,
  updated_at  = now()
where id_servicio = 2;

update public.catalogo_servicios_costos
set
  servicio    = 'Liquidacion medico SICT',
  costo_base  = 3700.00,
  precio_3    = 3700.00,
  precio_4    = 3700.00,
  precio_5    = 3700.00,
  precio_6    = 0,
  com_1       = 400.00,
  updated_at  = now()
where id_servicio = 27;

update public.catalogo_servicios_costos
set
  servicio    = 'Adicion categoria',
  costo_base  = 200.00,
  precio_3    = 200.00,
  precio_4    = 200.00,
  precio_5    = 200.00,
  precio_6    = 200.00,
  com_1       = 0,
  updated_at  = now()
where id_servicio = 31;

update public.catalogo_servicios_costos
set
  servicio    = 'Internacional',
  costo_base  = 2000.00,
  precio_3    = 2000.00,
  precio_4    = 2000.00,
  precio_5    = 2000.00,
  precio_6    = 0,
  com_1       = 200.00,
  updated_at  = now()
where id_servicio = 45;

update public.catalogo_servicios_costos
set
  servicio    = 'Medico MNP',
  costo_base  = 13500.00,
  precio_3    = 13500.00,
  precio_4    = 13500.00,
  precio_5    = 13500.00,
  precio_6    = 0,
  com_1       = 400.00,
  updated_at  = now()
where id_servicio = 46;

update public.catalogo_servicios_costos
set
  costo_base  = 550.00,
  precio_3    = 550.00,
  precio_4    = 550.00,
  precio_5    = 550.00,
  precio_6    = 0,
  com_1       = 50.00,
  updated_at  = now()
where id_servicio = 47;

update public.catalogo_servicios_costos
set
  servicio    = 'Liquidacion medico tercero',
  costo_base  = 12500.00,
  precio_3    = 12500.00,
  precio_4    = 12500.00,
  precio_5    = 12500.00,
  precio_6    = 0,
  com_1       = 400.00,
  updated_at  = now()
where id_servicio = 49;

-- ── Nuevos servicios del catálogo ────────────────────────────────────────────

insert into public.catalogo_servicios_costos (
  id_servicio,
  orden,
  servicio,
  tipo_servicio,
  costo_base,
  precio_3,
  precio_4,
  precio_5,
  precio_6,
  precio_7,
  precio_8,
  precio_9,
  precio_10,
  precio_11,
  precio_12,
  precio_13,
  precio_14,
  precio_15,
  precio_16,
  precio_17,
  com_1
)
values
  (58, 200, 'Cursos renovaciones', 2, 1200.00, 1200.00, 1200.00, 1200.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (59, 201, 'Curso nuevo ingreso A', 2, 2100.00, 2100.00, 2100.00, 2100.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (60, 202, 'Curso nuevo ingreso B', 2, 1700.00, 1700.00, 1700.00, 1700.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (61, 203, 'Curso nuevo ingreso D', 2, 2100.00, 2100.00, 2100.00, 2100.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (62, 204, 'Curso nuevo ingreso E full', 2, 1900.00, 1900.00, 1900.00, 1900.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (63, 205, 'Curso nuevo ingreso E materiales', 2, 1700.00, 1700.00, 1700.00, 1700.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (64, 206, 'Curso nuevo ingreso F', 2, 2100.00, 2100.00, 2100.00, 2100.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (65, 207, 'Recuperacion de contraseña', 1, 200.00, 200.00, 200.00, 200.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  (66, 208, 'Cartas psiquiatria', 1, 6000.00, 6000.00, 6000.00, 6000.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500.00),
  (67, 37, 'Liquidacion medico MNP', 1, 12500.00, 12500.00, 12500.00, 12500.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (68, 1, 'Medico MNP nuevo ingreso', 1, 17000.00, 17000.00, 17000.00, 17000.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00),
  (69, 37, 'Liquidacion medico MNP nuevo ingreso', 1, 16000.00, 16000.00, 16000.00, 16000.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400.00)
on conflict (id_servicio) do update set
  orden         = excluded.orden,
  servicio      = excluded.servicio,
  tipo_servicio = excluded.tipo_servicio,
  costo_base    = excluded.costo_base,
  precio_3      = excluded.precio_3,
  precio_4      = excluded.precio_4,
  precio_5      = excluded.precio_5,
  precio_6      = excluded.precio_6,
  precio_7      = excluded.precio_7,
  precio_8      = excluded.precio_8,
  precio_9      = excluded.precio_9,
  precio_10     = excluded.precio_10,
  precio_11     = excluded.precio_11,
  precio_12     = excluded.precio_12,
  precio_13     = excluded.precio_13,
  precio_14     = excluded.precio_14,
  precio_15     = excluded.precio_15,
  precio_16     = excluded.precio_16,
  precio_17     = excluded.precio_17,
  com_1         = excluded.com_1,
  updated_at    = now();
