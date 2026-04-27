-- Trazabilidad rapida por registro:
-- agrega created_by / updated_by en operadores y ventas.
-- Mantiene audit_log como historial completo.

alter table public.operadores
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.ventas
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Backfill basico para filas historicas (si no tienen valor)
update public.operadores
set
  created_by = coalesce(created_by, updated_by),
  updated_by = coalesce(updated_by, created_by)
where created_by is null or updated_by is null;

update public.ventas
set
  created_by = coalesce(created_by, updated_by),
  updated_by = coalesce(updated_by, created_by)
where created_by is null or updated_by is null;

create or replace function public.set_row_actor_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    new.updated_by := coalesce(new.updated_by, new.created_by, auth.uid());
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := coalesce(old.created_by, new.created_by);
    new.updated_by := auth.uid();
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_operadores_set_actor_fields on public.operadores;
create trigger trg_operadores_set_actor_fields
before insert or update on public.operadores
for each row execute function public.set_row_actor_fields();

drop trigger if exists trg_ventas_set_actor_fields on public.ventas;
create trigger trg_ventas_set_actor_fields
before insert or update on public.ventas
for each row execute function public.set_row_actor_fields();
