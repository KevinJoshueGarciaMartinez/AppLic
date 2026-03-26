export interface Promotor {
  id_promotor: number;
  nombre: string | null;
  nick: string | null;
  orden: number;
  columna_servicios: number;
}

export interface Operador {
  numero_consecutivo: number;
  fecha: string | null;
  hora: string | null;

  // Datos personales
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  curp: string;
  telefono_1: string | null;
  telefono_2: string | null;
  telefono_3: string | null;
  direccion: string | null;
  escolaridad: string | null;
  antiguedad_necesaria: string | null;

  // Promotor
  id_promotor: number | null;
  promotores?: { nombre: string | null } | null;

  // Licencia y médico
  num_exp_med_preventiva: string | null;
  licencia_numero: string | null;
  licencia_vigencia: string | null;

  // Cita SCT
  cita_fecha_solicitada: string | null;
  cita_fecha_asignada: string | null;
  hoja_ayuda_pago_ventanilla: boolean;
  contrasena_lfd: string | null;
  forma_cobro_cita: string | null;
  cobro_derechos_eap_sct: string | null;
  estatus_progreso_cita: boolean;
  estatus_concluido_cita: boolean;

  // Traslado
  fecha_traslado: string | null;
  punto_reunion: string | null;
  hora_encuentro: string | null;
  quien_cobro_traslado: string | null;
  forma_cobro_traslado: string | null;
  estatus_progreso_traslado: boolean;
  estatus_concluido_traslado: boolean;
  observaciones_traslado: string | null;
  observaciones_ruta: string | null;
  documentos_ruta: string | null;

  // Documentación
  acta: boolean;
  identificacion: boolean;
  comprobante_domicilio: boolean;
  formato_lleno_firmado: boolean;
  tramite_a_realizar: string | null;
  pago_derechos: boolean;

  // Curso
  horas_requeridas: string | null;
  medio_solicitud_curso: string | null;
  fecha_solicitud_curso: string | null;
  destinatario_constancia: string | null;
  entregado: boolean;
  entregado_fecha: string | null;
  entregado_recibio: string | null;
  quien_cobro_curso: string | null;
  forma_cobro_curso: string | null;
  estatus_progreso_curso: boolean;
  estatus_concluido_curso: boolean;

  // Montos
  pago_total: number;
  faltante_total: number;
  regresar_al_operador: number;

  // General
  confirmado: boolean;
  contacto_sct: string | null;
  asistencia: boolean;

  created_at: string;
  updated_at: string;
}

export type OperadorInsert = Omit<
  Operador,
  "numero_consecutivo" | "created_at" | "updated_at" | "promotores"
>;
