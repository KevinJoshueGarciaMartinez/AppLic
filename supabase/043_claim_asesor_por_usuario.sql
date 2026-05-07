-- Permite que cada usuario reclame su propio asesor una sola vez.
-- El asesor queda reservado de forma global para evitar duplicados entre usuarios.

create unique index if not exists uq_usuarios_asesor_asignado_normalizado
  on public.usuarios ((upper(btrim(asesor_asignado))))
  where asesor_asignado is not null and btrim(asesor_asignado) <> '';

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
