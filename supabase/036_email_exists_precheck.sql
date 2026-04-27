-- Precheck de correo para flujo de registro:
-- permite verificar si el correo ya existe en public.usuarios antes de signUp.

create or replace function public.email_exists_in_usuarios(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where lower(u.usuario) = lower(p_email)
  );
$$;

grant execute on function public.email_exists_in_usuarios(text) to anon, authenticated;
