-- Migracion: Tabla Operadores
-- Origen Access: Operadores (11553 registros)
-- PK: numero_consecutivo (autoincremento)
-- CURP es el identificador unico de negocio (requerido)
-- Depende de: promotores

create table if not exists public.operadores (
  numero_consecutivo bigint primary key generated always as identity,
  fecha date not null default current_date,
  hora time,

  -- Datos personales
  nombre text not null,
  apellido_paterno text,
  apellido_materno text,
  curp text not null,
  telefono_1 varchar(10),
  telefono_2 varchar(10),
  telefono_3 varchar(10),
  direccion text,
  escolaridad text,
  antiguedad_necesaria text,

  -- Promotor asignado
  id_promotor bigint references public.promotores (id_promotor) on delete set null,

  -- Licencia y examen medico
  num_exp_med_preventiva text,
  licencia_numero text,
  licencia_vigencia date,

  -- Cita SCT
  cita_fecha_solicitada date,
  cita_fecha_asignada date,
  hoja_ayuda_pago_ventanilla boolean not null default false,
  contrasena_lfd text,
  forma_cobro_cita text,
  cobro_derechos_eap_sct text,
  estatus_progreso_cita boolean not null default false,
  estatus_concluido_cita boolean not null default false,

  -- Traslado
  fecha_traslado date,
  punto_reunion text,
  hora_encuentro time,
  quien_cobro_traslado text,
  forma_cobro_traslado text,
  estatus_progreso_traslado boolean not null default false,
  estatus_concluido_traslado boolean not null default false,
  observaciones_traslado text,
  observaciones_ruta text,
  documentos_ruta text,

  -- Documentacion
  acta boolean not null default false,
  identificacion boolean not null default false,
  comprobante_domicilio boolean not null default false,
  formato_lleno_firmado boolean not null default false,
  tramite_a_realizar text,
  pago_derechos boolean not null default false,

  -- Curso
  horas_requeridas text,
  medio_solicitud_curso text,
  fecha_solicitud_curso date,
  destinatario_constancia text,
  entregado boolean not null default false,
  entregado_fecha date,
  entregado_recibio text,
  quien_cobro_curso text,
  forma_cobro_curso text,
  estatus_progreso_curso boolean not null default false,
  estatus_concluido_curso boolean not null default false,

  -- Montos
  pago_total numeric(12,2) not null default 0,
  faltante_total numeric(12,2) not null default 0,
  regresar_al_operador numeric(12,2) not null default 0,

  -- Estatus general
  confirmado boolean not null default false,
  contacto_sct text,
  asistencia boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operadores_curp_not_empty check (curp <> '')
);

create index if not exists idx_operadores_curp on public.operadores (curp);
create index if not exists idx_operadores_nombre on public.operadores (nombre);
create index if not exists idx_operadores_id_promotor on public.operadores (id_promotor);
create index if not exists idx_operadores_fecha on public.operadores (fecha);
create index if not exists idx_operadores_identificacion on public.operadores (identificacion);
