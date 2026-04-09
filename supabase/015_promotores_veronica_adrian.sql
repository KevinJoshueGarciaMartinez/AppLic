-- Veronica Villafan y Adrian Garcia (orden y columna_servicios como Valeria/Aranza).
-- Sin fijar id_promotor: respeta identity. Idempotente por nombre.
-- created_at / updated_at quedan con default (now()).

insert into public.promotores (nombre, nick, orden, columna_servicios)
select 'Veronica Villafan', 'Veronica', 0, 0
where not exists (
  select 1 from public.promotores p where p.nombre = 'Veronica Villafan'
);

insert into public.promotores (nombre, nick, orden, columna_servicios)
select 'Adrian Garcia', 'Adrian', 0, 0
where not exists (
  select 1 from public.promotores p where p.nombre = 'Adrian Garcia'
);
