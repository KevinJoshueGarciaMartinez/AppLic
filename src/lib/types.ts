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

// ── Catálogo de servicios ─────────────────────────────────────────────────────
export interface Servicio {
  id_servicio: number;
  orden: number;
  servicio: string;
  tipo_servicio: number | null;
  costo_base: number;
  com_1: number;
}

// ── Línea de servicio (estado local del formulario) ──────────────────────────
export interface VentaItem {
  id_servicio: number | null;
  servicio: string;
  tipo_servicio: number | null;
  costo: number;
  com_1: number;
  /** Nota por línea; se guarda en ventas.observaciones por fila */
  observaciones: string | null;
}

// ── Ventas ────────────────────────────────────────────────────────────────────
export interface Venta {
  id: number;
  ticket_id: number | null;
  fecha: string;
  hora: string | null;

  operador_id: number | null;
  operador_nombre: string | null;

  id_promotor: number | null;
  promotor: string | null;
  promotores?: { nombre: string | null } | null;

  id_servicio: number | null;
  servicio: string | null;
  tipo_servicio: number | null;
  catalogo_servicios_costos?: { servicio: string; costo_base: number } | null;

  costo: number;
  costo_promotor: number;
  comision_promotor: number; // generated
  comision_pagada: boolean;

  cobro: number;
  faltante: number; // generated
  egreso: number;
  total_cobrado: number; // generated

  forma_pago: "Efectivo" | "Deposito";
  numero_referencia: string | null;

  observaciones: string | null;
  fecha_solicitud_curso: string | null;
  fecha_pago: string | null;

  created_at: string;
  updated_at: string;
}

export type VentaInsert = Omit<
  Venta,
  | "id"
  | "created_at"
  | "updated_at"
  | "comision_promotor"
  | "faltante"
  | "total_cobrado"
  | "promotores"
  | "catalogo_servicios_costos"
>;
