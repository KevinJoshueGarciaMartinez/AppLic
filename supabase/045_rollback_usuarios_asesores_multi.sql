-- Rollback del esquema multi-asesor (044) para volver a 1 asesor por usuario.

-- 1) Volver a definir app_claim_asesor para actualizar solo usuarios.asesor_asignado
create or replace function public.app_claim_asesor(p_asesor text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asesor text;
begin
  v_asesor := upper(btrim(coalesce(p_asesor, '')));
  if v_asesor = '' then
    raise exception 'Debes capturar un asesor valido.';
  end if;

  begin
    update public.usuarios
    set asesor_asignado = v_asesor,
        updated_at = now()
    where id_usuario = auth.uid()
      and (asesor_asignado is null or btrim(asesor_asignado) = '');

    if not found then
      raise exception 'Tu usuario ya tiene asesor asignado o no existe en el padron.';
    end if;
  exception
    when unique_violation then
      raise exception 'Ese asesor ya esta asignado a otro usuario.';
  end;

  return v_asesor;
end;
$$;

revoke all on function public.app_claim_asesor(text) from public;
grant execute on function public.app_claim_asesor(text) to authenticated;

-- 2) Eliminar tabla y objetos de multi-asesor si existen
drop policy if exists usuarios_asesores_select on public.usuarios_asesores;
drop policy if exists usuarios_asesores_insert on public.usuarios_asesores;
drop policy if exists usuarios_asesores_update on public.usuarios_asesores;
drop policy if exists usuarios_asesores_delete on public.usuarios_asesores;

drop table if exists public.usuarios_asesores;
