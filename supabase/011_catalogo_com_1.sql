-- Agrega columna de comisión directa al catálogo de servicios
alter table public.catalogo_servicios_costos
  add column if not exists com_1 numeric(12,2) not null default 0;

alter table public.catalogo_servicios_costos
  add constraint catalogo_com_1_non_negative check (com_1 >= 0);
