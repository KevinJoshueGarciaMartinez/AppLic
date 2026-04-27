-- Fase 2: control de acceso por rol + auditoria de movimientos
-- Compatible con estructura actual: public.usuarios + public.usuarios_nivel
-- Nota: App frontend usa una vista "profiles" para resolver rol/activo por usuario.

-- 1) Niveles de acceso de negocio
insert into public.usuarios_nivel (nivel_usuario) values
  ('Administrador'),
  ('Recepcion'),
  ('Ventas')
on conflict (nivel_usuario) do nothing;

alter table public.usuarios
  add column if not exists activo boolean not null default true;

-- 2) Vista de compatibilidad para frontend (src/App.tsx)
create or replace view public.profiles as
select
  u.id_usuario as user_id,
  case
    when lower(un.nivel_usuario) in ('admin', 'administrador') then 'admin'
    when lower(un.nivel_usuario) in ('recepcion', 'recepción') then 'recepcion'
    when lower(un.nivel_usuario) = 'ventas' then 'ventas'
    else null
  end as rol,
  coalesce(u.activo, true) as activo
from public.usuarios u
left join public.usuarios_nivel un on un.id_nivel = u.id_nivel;

grant select on public.profiles to authenticated;

-- 3) Helpers para politicas RLS
create or replace function public.app_actor_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when lower(un.nivel_usuario) in ('admin', 'administrador') then 'admin'
      when lower(un.nivel_usuario) in ('recepcion', 'recepción') then 'recepcion'
      when lower(un.nivel_usuario) = 'ventas' then 'ventas'
      else null
    end
  from public.usuarios u
  left join public.usuarios_nivel un on un.id_nivel = u.id_nivel
  where u.id_usuario = auth.uid()
    and coalesce(u.activo, true) = true
  limit 1;
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_actor_role() = 'admin';
$$;

create or replace function public.app_is_recepcion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_actor_role() = 'recepcion';
$$;

create or replace function public.app_is_ventas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_actor_role() = 'ventas';
$$;

-- 4) RLS por tabla operativa
alter table public.operadores enable row level security;
alter table public.ventas enable row level security;
alter table public.ventas_pagos enable row level security;
alter table public.tickets enable row level security;
alter table public.operador_saldo_movimientos enable row level security;

-- Operadores: admin y recepcion full; ventas solo lectura/actualizacion (seguimiento)
drop policy if exists operadores_select on public.operadores;
drop policy if exists operadores_insert on public.operadores;
drop policy if exists operadores_update on public.operadores;
drop policy if exists operadores_delete on public.operadores;

create policy operadores_select on public.operadores
for select using (public.app_is_admin() or public.app_is_recepcion() or public.app_is_ventas());

create policy operadores_insert on public.operadores
for insert with check (public.app_is_admin() or public.app_is_recepcion());

create policy operadores_update on public.operadores
for update using (public.app_is_admin() or public.app_is_recepcion() or public.app_is_ventas())
with check (public.app_is_admin() or public.app_is_recepcion() or public.app_is_ventas());

create policy operadores_delete on public.operadores
for delete using (public.app_is_admin() or public.app_is_recepcion());

-- Ventas: admin y recepcion full
drop policy if exists ventas_select on public.ventas;
drop policy if exists ventas_insert on public.ventas;
drop policy if exists ventas_update on public.ventas;
drop policy if exists ventas_delete on public.ventas;

create policy ventas_select on public.ventas
for select using (public.app_is_admin() or public.app_is_recepcion());

create policy ventas_insert on public.ventas
for insert with check (public.app_is_admin() or public.app_is_recepcion());

create policy ventas_update on public.ventas
for update using (public.app_is_admin() or public.app_is_recepcion())
with check (public.app_is_admin() or public.app_is_recepcion());

create policy ventas_delete on public.ventas
for delete using (public.app_is_admin() or public.app_is_recepcion());

-- Pagos de ventas: admin y recepcion full
drop policy if exists ventas_pagos_select on public.ventas_pagos;
drop policy if exists ventas_pagos_insert on public.ventas_pagos;
drop policy if exists ventas_pagos_update on public.ventas_pagos;
drop policy if exists ventas_pagos_delete on public.ventas_pagos;

create policy ventas_pagos_select on public.ventas_pagos
for select using (public.app_is_admin() or public.app_is_recepcion());

create policy ventas_pagos_insert on public.ventas_pagos
for insert with check (public.app_is_admin() or public.app_is_recepcion());

create policy ventas_pagos_update on public.ventas_pagos
for update using (public.app_is_admin() or public.app_is_recepcion())
with check (public.app_is_admin() or public.app_is_recepcion());

create policy ventas_pagos_delete on public.ventas_pagos
for delete using (public.app_is_admin() or public.app_is_recepcion());

-- Tickets: admin y recepcion full
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;

create policy tickets_select on public.tickets
for select using (public.app_is_admin() or public.app_is_recepcion());

create policy tickets_insert on public.tickets
for insert with check (public.app_is_admin() or public.app_is_recepcion());

create policy tickets_update on public.tickets
for update using (public.app_is_admin() or public.app_is_recepcion())
with check (public.app_is_admin() or public.app_is_recepcion());

create policy tickets_delete on public.tickets
for delete using (public.app_is_admin() or public.app_is_recepcion());

-- Movimientos de saldo: admin y recepcion full
drop policy if exists operador_saldo_mov_select on public.operador_saldo_movimientos;
drop policy if exists operador_saldo_mov_insert on public.operador_saldo_movimientos;
drop policy if exists operador_saldo_mov_update on public.operador_saldo_movimientos;
drop policy if exists operador_saldo_mov_delete on public.operador_saldo_movimientos;

create policy operador_saldo_mov_select on public.operador_saldo_movimientos
for select using (public.app_is_admin() or public.app_is_recepcion());

create policy operador_saldo_mov_insert on public.operador_saldo_movimientos
for insert with check (public.app_is_admin() or public.app_is_recepcion());

create policy operador_saldo_mov_update on public.operador_saldo_movimientos
for update using (public.app_is_admin() or public.app_is_recepcion())
with check (public.app_is_admin() or public.app_is_recepcion());

create policy operador_saldo_mov_delete on public.operador_saldo_movimientos
for delete using (public.app_is_admin() or public.app_is_recepcion());

-- 5) Auditoria de movimientos (quien hizo que cambio y cuando)
create table if not exists public.audit_log (
  id bigint primary key generated always as identity,
  tabla text not null,
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid,
  actor_role text,
  registro_pk text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_tabla_created_at
  on public.audit_log (tabla, created_at desc);
create index if not exists idx_audit_log_actor_created_at
  on public.audit_log (actor_user_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
drop policy if exists audit_log_insert on public.audit_log;
drop policy if exists audit_log_update on public.audit_log;
drop policy if exists audit_log_delete on public.audit_log;

create policy audit_log_select on public.audit_log
for select using (public.app_is_admin());

-- Solo triggers (security definer) insertan auditoria; nadie escribe directo.
create policy audit_log_insert on public.audit_log
for insert with check (false);
create policy audit_log_update on public.audit_log
for update using (false) with check (false);
create policy audit_log_delete on public.audit_log
for delete using (false);

create or replace function public.audit_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  record_pk text;
begin
  record_pk := coalesce(
    to_jsonb(new)->>'id',
    to_jsonb(new)->>'numero_consecutivo',
    to_jsonb(old)->>'id',
    to_jsonb(old)->>'numero_consecutivo',
    'n/a'
  );

  if tg_op = 'INSERT' then
    insert into public.audit_log (
      tabla, operacion, actor_user_id, actor_role, registro_pk, before_data, after_data
    ) values (
      tg_table_name, tg_op, auth.uid(), public.app_actor_role(), record_pk, null, to_jsonb(new)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (
      tabla, operacion, actor_user_id, actor_role, registro_pk, before_data, after_data
    ) values (
      tg_table_name,
      tg_op,
      auth.uid(),
      public.app_actor_role(),
      record_pk,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (
      tabla, operacion, actor_user_id, actor_role, registro_pk, before_data, after_data
    ) values (
      tg_table_name, tg_op, auth.uid(), public.app_actor_role(), record_pk, to_jsonb(old), null
    );
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_audit_operadores on public.operadores;
create trigger trg_audit_operadores
after insert or update or delete on public.operadores
for each row execute function public.audit_log_change();

drop trigger if exists trg_audit_ventas on public.ventas;
create trigger trg_audit_ventas
after insert or update or delete on public.ventas
for each row execute function public.audit_log_change();

drop trigger if exists trg_audit_ventas_pagos on public.ventas_pagos;
create trigger trg_audit_ventas_pagos
after insert or update or delete on public.ventas_pagos
for each row execute function public.audit_log_change();

drop trigger if exists trg_audit_tickets on public.tickets;
create trigger trg_audit_tickets
after insert or update or delete on public.tickets
for each row execute function public.audit_log_change();

drop trigger if exists trg_audit_operador_saldo_movimientos on public.operador_saldo_movimientos;
create trigger trg_audit_operador_saldo_movimientos
after insert or update or delete on public.operador_saldo_movimientos
for each row execute function public.audit_log_change();
