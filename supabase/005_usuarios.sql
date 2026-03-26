-- Migracion: Tabla Usuarios
-- Origen Access: Usuarios (2 registros) + Usuarios_Nivel
-- Nota: La autenticacion real se maneja por Supabase Auth.
-- Esta tabla guarda el perfil y nivel de seguridad del usuario de la app.

create table if not exists public.usuarios_nivel (
  id_nivel bigint primary key generated always as identity,
  nivel_usuario text not null unique,
  created_at timestamptz not null default now()
);

-- Niveles base equivalentes a Access
insert into public.usuarios_nivel (nivel_usuario) values
  ('Admin'),
  ('Operador'),
  ('Solo lectura')
on conflict (nivel_usuario) do nothing;

create table if not exists public.usuarios (
  id_usuario uuid primary key references auth.users (id) on delete cascade,
  nombre_usuario text,
  usuario text,
  id_nivel bigint references public.usuarios_nivel (id_nivel) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_usuarios_usuario on public.usuarios (usuario);
create index if not exists idx_usuarios_nivel on public.usuarios (id_nivel);
