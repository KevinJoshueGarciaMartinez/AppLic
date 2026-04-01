-- Migración: Corregir modelo de multi-servicio
-- venta_items era incorrecto; la tabla ventas ya es la lista desglosada.
-- Ahora: cada servicio = una fila en ventas; un ticket agrupa varias ventas.

-- 1. Eliminar tabla incorrecta
drop table if exists public.venta_items;

-- 2. Tabla tickets (cabecera de grupo)
create table if not exists public.tickets (
  id         bigint primary key generated always as identity,
  fecha      date not null default current_date,
  created_at timestamptz not null default now()
);

-- 3. Vincular ventas a tickets (nullable: ventas sin grupo no tienen ticket)
alter table public.ventas
  add column if not exists ticket_id bigint
    references public.tickets(id) on delete set null;

create index if not exists idx_ventas_ticket_id on public.ventas(ticket_id);
