import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Operador, OperadorInsert } from "../lib/types";
import { MEDIOS_CAPTACION, etiquetaMedioCaptacion } from "../lib/mediosCaptacion";
import { ASESORES_OPCIONES, asesorTonoClass } from "../lib/asesoresCatalogo";
import {
  ESTATUS_SEGUIMIENTO_DEFECTO,
  ESTATUS_SEGUIMIENTO_OPCIONES,
  esEstatusSeguimientoEnCatalogo,
  esEstatusSeguimientoOcultoPendientes,
  esEstatusSeguimientoTerminalSemaforo,
} from "../lib/estatusSeguimiento";

type FilaSeguimiento = Pick<
  Operador,
  | "numero_consecutivo"
  | "nombre"
  | "apellido_paterno"
  | "apellido_materno"
  | "telefono_1"
  | "medio_captacion"
  | "fecha_captacion"
  | "proxima_llamada"
  | "estatus_seguimiento"
  | "notas_seguimiento"
  | "asesor"
  | "num_exp_med_preventiva"
  | "tramite_a_realizar"
> & {
  promotores?: { nombre: string | null } | null;
};

type ContextoSeguimiento = {
  userId: string;
  email: string | null;
  rol: "admin" | "recepcion" | "ventas" | null;
  asesorAsignado: string | null;
};

function normalizarTexto(v: string | null | undefined): string {
  return (v ?? "").trim().toUpperCase();
}

async function fetchContextoSeguimiento(): Promise<ContextoSeguimiento> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  const user = authData.user;
  if (!user) throw new Error("No hay sesion activa.");

  const [{ data: profileData, error: profileError }, { data: usuarioData, error: usuarioError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("rol")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("usuarios")
        .select("asesor_asignado")
        .eq("id_usuario", user.id)
        .single(),
    ]);

  if (profileError) throw new Error(profileError.message);
  if (usuarioError) throw new Error(usuarioError.message);

  const rolRaw = String(profileData?.rol ?? "").trim();
  const rol =
    rolRaw === "admin" || rolRaw === "recepcion" || rolRaw === "ventas"
      ? rolRaw
      : null;
  return {
    userId: user.id,
    email: user.email ?? null,
    rol,
    asesorAsignado: usuarioData?.asesor_asignado?.trim() || null,
  };
}

async function fetchProspectos(
  contexto: Pick<ContextoSeguimiento, "rol" | "asesorAsignado">,
): Promise<FilaSeguimiento[]> {
  const { data, error } = await supabase
    .from("operadores")
    .select(
      "numero_consecutivo, nombre, apellido_paterno, apellido_materno, telefono_1, medio_captacion, fecha_captacion, proxima_llamada, estatus_seguimiento, notas_seguimiento, asesor, num_exp_med_preventiva, tramite_a_realizar, promotores(nombre)",
    )
    .eq("es_prospecto", true)
    .order("proxima_llamada", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FilaSeguimiento[];
  if (contexto.rol === "admin") return rows;
  const asesorNorm = normalizarTexto(contexto.asesorAsignado);
  if (!asesorNorm) return [];
  return rows.filter((r) => normalizarTexto(r.asesor) === asesorNorm);
}

function nombreCompleto(op: FilaSeguimiento) {
  return [op.nombre, op.apellido_paterno, op.apellido_materno]
    .filter(Boolean)
    .join(" ");
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function truncar(s: string | null, max: number) {
  if (!s) return "—";
  const t = s.trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Fila tipo semáforo según próxima llamada (fechas ISO YYYY-MM-DD) y estatus. */
function claseSemaforoSeguimiento(op: FilaSeguimiento, hoy: string): string {
  if (esEstatusSeguimientoTerminalSemaforo(op.estatus_seguimiento)) {
    return "seguimiento-sem seguimiento-sem--gris";
  }
  const pl = op.proxima_llamada;
  if (pl == null || pl === "") {
    return "seguimiento-sem seguimiento-sem--gris";
  }
  if (pl < hoy) return "seguimiento-sem seguimiento-sem--rojo";
  if (pl === hoy) return "seguimiento-sem seguimiento-sem--amarillo";
  return "seguimiento-sem seguimiento-sem--verde";
}

/** Base para insert de prospecto (resto de columnas con valores por defecto). */
function baseProspectoInsert(): OperadorInsert {
  const fecha = new Date().toISOString().slice(0, 10);
  const hora = new Date().toTimeString().slice(0, 5);
  return {
    fecha,
    hora,
    nombre: "",
    apellido_paterno: null,
    apellido_materno: null,
    curp: null,
    telefono_1: null,
    telefono_2: null,
    telefono_3: null,
    direccion: null,
    escolaridad: null,
    antiguedad_necesaria: null,
    id_promotor: null,
    num_exp_med_preventiva: null,
    licencia_numero: null,
    licencia_vigencia: null,
    cita_fecha_solicitada: null,
    cita_fecha_asignada: null,
    hoja_ayuda_pago_ventanilla: false,
    contrasena_lfd: null,
    forma_cobro_cita: null,
    cobro_derechos_eap_sct: null,
    estatus_progreso_cita: false,
    estatus_concluido_cita: false,
    fecha_traslado: null,
    punto_reunion: null,
    hora_encuentro: null,
    quien_cobro_traslado: null,
    forma_cobro_traslado: null,
    estatus_progreso_traslado: false,
    estatus_concluido_traslado: false,
    observaciones_traslado: null,
    observaciones_ruta: null,
    documentos_ruta: null,
    acta: false,
    identificacion: false,
    comprobante_domicilio: false,
    formato_lleno_firmado: false,
    tramite_a_realizar: null,
    pago_derechos: false,
    horas_requeridas: null,
    medio_solicitud_curso: null,
    fecha_solicitud_curso: null,
    destinatario_constancia: null,
    entregado: false,
    entregado_fecha: null,
    entregado_recibio: null,
    quien_cobro_curso: null,
    forma_cobro_curso: null,
    estatus_progreso_curso: false,
    estatus_concluido_curso: false,
    pago_total: 0,
    faltante_total: 0,
    regresar_al_operador: 0,
    confirmado: false,
    contacto_sct: null,
    asistencia: false,
    es_prospecto: true,
    medio_captacion: null,
    fecha_captacion: null,
    proxima_llamada: null,
    estatus_seguimiento: null,
    notas_seguimiento: null,
    asesor: null,
  };
}

type ModalProspecto = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  telefono_1: string;
  medio_captacion: string;
  proxima_llamada: string;
  estatus_seguimiento: string;
  notas: string;
  asesor: string;
  num_exp_med_preventiva: string;
  tramite_a_realizar: string;
};

function emptyModalProspecto(): ModalProspecto {
  const hoy = hoyISO();
  return {
    nombre: "",
    apellido_paterno: "",
    apellido_materno: "",
    telefono_1: "",
    medio_captacion: "",
    proxima_llamada: hoy,
    estatus_seguimiento: ESTATUS_SEGUIMIENTO_DEFECTO,
    notas: "",
    asesor: "",
    num_exp_med_preventiva: "",
    tramite_a_realizar: "",
  };
}

function modalToInsert(m: ModalProspecto): OperadorInsert {
  const tel = m.telefono_1.replace(/\D/g, "").slice(0, 10);
  return {
    ...baseProspectoInsert(),
    nombre: m.nombre.trim(),
    apellido_paterno: m.apellido_paterno.trim() || null,
    apellido_materno: m.apellido_materno.trim() || null,
    telefono_1: tel || null,
    medio_captacion: m.medio_captacion.trim() || null,
    // Fecha de captacion = dia de registro; no editable en UI.
    fecha_captacion: hoyISO(),
    proxima_llamada: m.proxima_llamada.trim(),
    estatus_seguimiento: m.estatus_seguimiento || ESTATUS_SEGUIMIENTO_DEFECTO,
    notas_seguimiento: m.notas.trim() || null,
    asesor: m.asesor.trim() || null,
    num_exp_med_preventiva: m.num_exp_med_preventiva.trim() || null,
    tramite_a_realizar: m.tramite_a_realizar.trim() || null,
  };
}

type DetallesModalState = {
  id: number;
  nombre: string;
  medio_captacion: string | null;
  num_exp_med_preventiva: string | null;
  notas: string;
};

export default function SeguimientoVentas() {
  const queryClient = useQueryClient();
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [diaFiltro, setDiaFiltro] = useState("");
  const [asesorFiltro, setAsesorFiltro] = useState("");
  const [estatusFiltro, setEstatusFiltro] = useState<string[]>([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalForm, setModalForm] = useState<ModalProspecto>(emptyModalProspecto);
  const [modalError, setModalError] = useState<string | null>(null);
  const [detallesModal, setDetallesModal] = useState<DetallesModalState | null>(null);

  const {
    data: contextoSeguimiento,
    isLoading: loadingContexto,
    isError: isErrorContexto,
    error: errorContexto,
  } = useQuery({
    queryKey: ["seguimiento_contexto_usuario"],
    queryFn: fetchContextoSeguimiento,
  });

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: [
      "seguimiento_operadores",
      contextoSeguimiento?.rol ?? null,
      normalizarTexto(contextoSeguimiento?.asesorAsignado),
    ],
    enabled: !!contextoSeguimiento,
    queryFn: () =>
      fetchProspectos({
        rol: contextoSeguimiento?.rol ?? null,
        asesorAsignado: contextoSeguimiento?.asesorAsignado ?? null,
      }),
  });

  const hoy = hoyISO();

  useEffect(() => {
    if (!asesorFiltro || asesorFiltro === "__sin_asesor__") return;
    if (!(ASESORES_OPCIONES as readonly string[]).includes(asesorFiltro)) {
      setAsesorFiltro("");
    }
  }, [asesorFiltro]);

  const insertMutation = useMutation({
    mutationFn: async (payload: OperadorInsert) => {
      const { error: err } = await supabase.from("operadores").insert(payload);
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seguimiento_operadores"] });
      queryClient.invalidateQueries({ queryKey: ["operadores"] });
      setModalAbierto(false);
      setModalForm(emptyModalProspecto());
      setModalError(null);
    },
  });

  const patchEstatusMutation = useMutation({
    mutationFn: async (p: { id: number; estatus: string | null }) => {
      const { error: err } = await supabase
        .from("operadores")
        .update({ estatus_seguimiento: p.estatus })
        .eq("numero_consecutivo", p.id);
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seguimiento_operadores"] });
      queryClient.invalidateQueries({ queryKey: ["operadores"] });
    },
  });

  const patchNotasMutation = useMutation({
    mutationFn: async (p: { id: number; texto: string | null }) => {
      const { error: err } = await supabase
        .from("operadores")
        .update({ notas_seguimiento: p.texto })
        .eq("numero_consecutivo", p.id);
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seguimiento_operadores"] });
      queryClient.invalidateQueries({ queryKey: ["operadores"] });
      setDetallesModal(null);
    },
  });

  const overlayAbierto = modalAbierto || detallesModal != null;

  useEffect(() => {
    if (!overlayAbierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detallesModal && !patchNotasMutation.isPending) setDetallesModal(null);
      else if (modalAbierto && !insertMutation.isPending) setModalAbierto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayAbierto, detallesModal, modalAbierto, insertMutation.isPending, patchNotasMutation.isPending]);

  function abrirModal() {
    if (
      contextoSeguimiento?.rol !== "admin"
      && !normalizarTexto(contextoSeguimiento?.asesorAsignado)
    ) {
      setModalError(
        "No puedes crear prospectos porque tu usuario no tiene asesor asignado. Solicita la asignacion en Sistema -> Usuarios.",
      );
      return;
    }
    insertMutation.reset();
    const base = emptyModalProspecto();
    const asesorDefault = contextoSeguimiento?.asesorAsignado?.trim() || "";
    setModalForm({
      ...base,
      asesor: asesorDefault || base.asesor,
    });
    setModalError(null);
    setModalAbierto(true);
  }

  function setModal<K extends keyof ModalProspecto>(key: K, value: ModalProspecto[K]) {
    setModalForm((prev) => ({ ...prev, [key]: value }));
  }

  function guardarProspecto(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (
      contextoSeguimiento?.rol !== "admin"
      && !normalizarTexto(contextoSeguimiento?.asesorAsignado)
    ) {
      setModalError(
        "No puedes guardar prospectos sin asesor asignado en tu usuario. Solicita la asignacion al administrador.",
      );
      return;
    }
    if (!modalForm.nombre.trim()) {
      setModalError("El nombre es obligatorio.");
      return;
    }
    if (!modalForm.proxima_llamada.trim()) {
      setModalError("La próxima llamada es obligatoria para poder filtrar y ordenar el seguimiento.");
      return;
    }
    const asesorForzado =
      contextoSeguimiento?.rol === "admin"
        ? modalForm.asesor
        : (contextoSeguimiento?.asesorAsignado ?? "");
    insertMutation.mutate(
      modalToInsert({
        ...modalForm,
        asesor: asesorForzado,
      }),
    );
  }

  const filasBase = useMemo(() => {
    let rows = [...data];
    const txt = busqueda.trim().toLowerCase();
    if (txt) {
      rows = rows.filter((r) => {
        const nombre = nombreCompleto(r).toLowerCase();
        const tel = (r.telefono_1 ?? "").toLowerCase();
        return (
          nombre.includes(txt)
          || tel.includes(txt)
        );
      });
    }
    if (soloPendientes) {
      rows = rows.filter((r) => !esEstatusSeguimientoOcultoPendientes(r.estatus_seguimiento));
    }
    if (diaFiltro) {
      rows = rows.filter((r) => r.proxima_llamada === diaFiltro);
    }
    if (asesorFiltro === "__sin_asesor__") {
      rows = rows.filter((r) => !r.asesor?.trim());
    } else if (asesorFiltro) {
      rows = rows.filter((r) => (r.asesor ?? "").trim() === asesorFiltro);
    }
    rows.sort((a, b) => {
      const pa = a.proxima_llamada;
      const pb = b.proxima_llamada;
      if (pa === pb) return a.numero_consecutivo - b.numero_consecutivo;
      if (!pa && !pb) return 0;
      if (!pa) return 1;
      if (!pb) return -1;
      if (pa < hoy && pb >= hoy) return -1;
      if (pa >= hoy && pb < hoy) return 1;
      return pa < pb ? -1 : 1;
    });
    return rows;
  }, [data, busqueda, soloPendientes, diaFiltro, asesorFiltro, hoy]);

  const conteoEstatus = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of ESTATUS_SEGUIMIENTO_OPCIONES) mapa.set(s, 0);
    for (const r of filasBase) {
      const estatus = (r.estatus_seguimiento ?? "").trim() || ESTATUS_SEGUIMIENTO_DEFECTO;
      mapa.set(estatus, (mapa.get(estatus) ?? 0) + 1);
    }
    return mapa;
  }, [filasBase]);

  const filas = useMemo(() => {
    if (estatusFiltro.length === 0) return filasBase;
    const permitidos = new Set(estatusFiltro);
    return filasBase.filter((r) => {
      const estatus = (r.estatus_seguimiento ?? "").trim() || ESTATUS_SEGUIMIENTO_DEFECTO;
      return permitidos.has(estatus);
    });
  }, [filasBase, estatusFiltro]);

  function toggleEstatusFiltro(estatus: string) {
    setEstatusFiltro((prev) =>
      prev.includes(estatus)
        ? prev.filter((s) => s !== estatus)
        : [...prev, estatus],
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">📞</span> Seguimiento de ventas
          </h1>
          <p className="page-subtitle">
            Prospectos registrados como operadores ligeros. Orden por próxima
            llamada (vencidas primero). Cambia estatus en la tabla; captación, médico,
            trámite y notas en «Detalles». Al formalizar, completa CURP en el expediente
            y desmarca «Prospecto».
          </p>
        </div>
        <button className="btn-primary" type="button" onClick={abrirModal}>
          Registrar prospecto
        </button>
      </div>

      {(isErrorContexto || errorContexto) && (
        <div className="alert-error">
          Error al resolver el usuario de seguimiento: {(errorContexto as Error).message}
        </div>
      )}

      {modalAbierto && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !insertMutation.isPending) {
              setModalAbierto(false);
            }
          }}
        >
          <div
            className="modal-card modal-card--lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-prospecto-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Cerrar"
              disabled={insertMutation.isPending}
              onClick={() => setModalAbierto(false)}
            >
              ×
            </button>
            <h2 id="modal-prospecto-titulo" className="modal-title modal-title--info">
              Registrar prospecto
            </h2>
            <p className="modal-desc">
              Registro ligero en operadores (sin CURP). Podrás completar el expediente
              después desde «Expediente».
            </p>

            <form onSubmit={guardarProspecto}>
              <div className="modal-form-grid">
                <div className="form-field form-field-full">
                  <label>Nombre *</label>
                  <input
                    type="text"
                    value={modalForm.nombre}
                    onChange={(e) => setModal("nombre", e.target.value)}
                    autoFocus
                    maxLength={120}
                  />
                </div>
                <div className="form-field">
                  <label>Apellido paterno</label>
                  <input
                    type="text"
                    value={modalForm.apellido_paterno}
                    onChange={(e) => setModal("apellido_paterno", e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="form-field">
                  <label>Apellido materno</label>
                  <input
                    type="text"
                    value={modalForm.apellido_materno}
                    onChange={(e) => setModal("apellido_materno", e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="form-field form-field-full">
                  <label>Teléfono</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={modalForm.telefono_1}
                    onChange={(e) => setModal("telefono_1", e.target.value)}
                    placeholder="10 dígitos"
                    maxLength={14}
                  />
                </div>
                <div className="form-field">
                  <label>Asesor</label>
                  <select
                    value={modalForm.asesor}
                    onChange={(e) => setModal("asesor", e.target.value)}
                    disabled={contextoSeguimiento?.rol !== "admin"}
                  >
                    <option value="">— Seleccionar —</option>
                    {ASESORES_OPCIONES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Núm. medicina preventiva</label>
                  <input
                    type="text"
                    value={modalForm.num_exp_med_preventiva}
                    onChange={(e) =>
                      setModal("num_exp_med_preventiva", e.target.value)
                    }
                    maxLength={80}
                  />
                </div>
                <div className="form-field form-field-full">
                  <label>Trámite</label>
                  <input
                    type="text"
                    value={modalForm.tramite_a_realizar}
                    onChange={(e) =>
                      setModal("tramite_a_realizar", e.target.value)
                    }
                    maxLength={200}
                    placeholder="Trámite a realizar"
                  />
                </div>
                <div className="form-field">
                  <label>Medio de captación</label>
                  <select
                    value={modalForm.medio_captacion}
                    onChange={(e) => setModal("medio_captacion", e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {MEDIOS_CAPTACION.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">
                    Fecha de captación: se asigna automáticamente al día de registro.
                  </span>
                </div>
                <div className="form-field">
                  <label>Próxima llamada (seguimiento) *</label>
                  <input
                    type="date"
                    required
                    value={modalForm.proxima_llamada}
                    onChange={(e) => setModal("proxima_llamada", e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Estatus</label>
                  <select
                    value={modalForm.estatus_seguimiento}
                    onChange={(e) =>
                      setModal("estatus_seguimiento", e.target.value)
                    }
                  >
                    {ESTATUS_SEGUIMIENTO_OPCIONES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field form-field-full">
                  <label>Notas</label>
                  <textarea
                    className="modal-textarea"
                    rows={3}
                    value={modalForm.notas}
                    onChange={(e) => setModal("notas", e.target.value)}
                    placeholder="Recordatorios o detalle del contacto…"
                  />
                </div>
              </div>

              {modalError && (
                <div className="alert-error" style={{ marginTop: "12px" }}>
                  {modalError}
                </div>
              )}
              {insertMutation.isError && (
                <div className="alert-error" style={{ marginTop: "12px" }}>
                  {(insertMutation.error as Error).message}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={insertMutation.isPending}
                  onClick={() => setModalAbierto(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={insertMutation.isPending}
                >
                  {insertMutation.isPending ? "Guardando…" : "Guardar prospecto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detallesModal && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !patchNotasMutation.isPending) {
              setDetallesModal(null);
            }
          }}
        >
          <div
            className="modal-card modal-card--lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-detalles-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Cerrar"
              disabled={patchNotasMutation.isPending}
              onClick={() => setDetallesModal(null)}
            >
              ×
            </button>
            <h2 id="modal-detalles-titulo" className="modal-title modal-title--info">
              Detalles
            </h2>
            <p className="modal-desc">
              <strong>#{detallesModal.id}</strong> — {detallesModal.nombre}
            </p>
            <p className="field-hint" style={{ marginTop: "-4px", marginBottom: "12px" }}>
              Captación y médico son solo consulta; el resto del expediente (trámite, documentos,
              etc.) lo ves y editas con el botón. Las <strong>notas</strong> se guardan con
              «Guardar notas».
            </p>

            <div className="seguimiento-detalles-meta">
              <div className="seguimiento-detalles-meta__row">
                <span className="seguimiento-detalles-meta__label">Captación</span>
                <span className="seguimiento-detalles-meta__valor">
                  {etiquetaMedioCaptacion(detallesModal.medio_captacion)}
                </span>
              </div>
              <div className="seguimiento-detalles-meta__row">
                <span className="seguimiento-detalles-meta__label">Med. prev.</span>
                <span className="seguimiento-detalles-meta__valor">
                  {detallesModal.num_exp_med_preventiva?.trim()
                    ? detallesModal.num_exp_med_preventiva.trim()
                    : "—"}
                </span>
              </div>
            </div>

            <div className="seguimiento-detalles-expediente-wrap">
              <Link href={`/operadores/${detallesModal.id}?from=seguimiento`}>
                <button type="button" className="btn-edit">
                  Abrir expediente
                </button>
              </Link>
            </div>

            <div className="form-field form-field-full" style={{ marginTop: "1rem" }}>
              <label>Notas</label>
              <textarea
                className="modal-textarea"
                rows={5}
                value={detallesModal.notas}
                onChange={(e) =>
                  setDetallesModal((m) =>
                    m ? { ...m, notas: e.target.value } : m,
                  )
                }
                placeholder="Escribe o edita las notas de seguimiento…"
              />
            </div>

            {patchNotasMutation.isError && (
              <div className="alert-error" style={{ marginTop: "12px" }}>
                {(patchNotasMutation.error as Error).message}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={patchNotasMutation.isPending}
                onClick={() => setDetallesModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={patchNotasMutation.isPending}
                onClick={() =>
                  patchNotasMutation.mutate({
                    id: detallesModal.id,
                    texto: detallesModal.notas.trim() || null,
                  })
                }
              >
                {patchNotasMutation.isPending ? "Guardando notas…" : "Guardar notas"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <input
          className="search-input"
          type="text"
          placeholder="Buscar prospecto por nombre o teléfono..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ minWidth: "18rem" }}
        />
        {busqueda && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setBusqueda("")}
          >
            Limpiar búsqueda
          </button>
        )}
        <label className="checkbox-label" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          Ocultar finalizados
        </label>
        <div className="form-field" style={{ margin: 0, minWidth: "11rem" }}>
          <label style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>
            Filtrar por día (próx. llamada)
          </label>
          <input
            type="date"
            className="search-input"
            style={{ width: "100%" }}
            value={diaFiltro}
            onChange={(e) => setDiaFiltro(e.target.value)}
          />
        </div>
        {diaFiltro && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDiaFiltro("")}
          >
            Quitar filtro de día
          </button>
        )}
        <div className="form-field" style={{ margin: 0, minWidth: "12rem" }}>
          <label style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>
            Filtrar por asesor
          </label>
          <select
            className="search-input"
            style={{ width: "100%", padding: "8px 10px", cursor: "pointer" }}
            value={asesorFiltro}
            onChange={(e) => setAsesorFiltro(e.target.value)}
          >
            <option value="">Todos los asesores</option>
            <option value="__sin_asesor__">Sin asesor</option>
            {ASESORES_OPCIONES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {asesorFiltro && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setAsesorFiltro("")}
          >
            Quitar filtro de asesor
          </button>
        )}
        <div className="seguimiento-estatus-filtro" aria-label="Filtrar por estatus">
          <span className="seguimiento-estatus-filtro__label">Estatus:</span>
          <button
            type="button"
            className={`seguimiento-estatus-chip${estatusFiltro.length === 0 ? " seguimiento-estatus-chip--active" : ""}`}
            onClick={() => setEstatusFiltro([])}
          >
            Todos ({filasBase.length})
          </button>
          {ESTATUS_SEGUIMIENTO_OPCIONES.map((s) => {
            const activo = estatusFiltro.includes(s);
            const count = conteoEstatus.get(s) ?? 0;
            return (
              <button
                key={s}
                type="button"
                className={`seguimiento-estatus-chip${activo ? " seguimiento-estatus-chip--active" : ""}`}
                onClick={() => toggleEstatusFiltro(s)}
              >
                {s} ({count})
              </button>
            );
          })}
        </div>
        <span className="record-count">
          {loadingContexto || isLoading
            ? "Cargando…"
            : `${filas.length} prospecto${filas.length !== 1 ? "s" : ""}`}
        </span>
        <div className="seguimiento-leyenda" aria-label="Leyenda de prioridad por próxima llamada">
          <span className="seguimiento-leyenda__titulo">Prioridad:</span>
          <span className="seguimiento-leyenda__pill seguimiento-leyenda__pill--verde">
            A tiempo
          </span>
          <span className="seguimiento-leyenda__pill seguimiento-leyenda__pill--amarillo">
            Hoy
          </span>
          <span className="seguimiento-leyenda__pill seguimiento-leyenda__pill--rojo">
            Vencida
          </span>
          <span className="seguimiento-leyenda__pill seguimiento-leyenda__pill--gris">
            Sin fecha / finalizado
          </span>
        </div>
      </div>

      {isError && (
        <div className="alert-error">
          Error al cargar: {(error as Error).message}
        </div>
      )}

      {patchEstatusMutation.isError && (
        <div className="alert-error">
          No se pudo actualizar el estatus:{" "}
          {(patchEstatusMutation.error as Error).message}
        </div>
      )}

      {!loadingContexto && !isLoading && !isError && !isErrorContexto && (
        <div className="table-wrapper table-wrapper--wide">
          <table className="data-table data-table--seguimiento">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Fecha captación</th>
                <th>Próx. llamada</th>
                <th>Asesor</th>
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    {busqueda
                      ? "No hay prospectos que coincidan con la búsqueda."
                      : "No hay prospectos con estos filtros."}
                  </td>
                </tr>
              ) : (
                filas.map((op) => {
                  const rawEstatus = (op.estatus_seguimiento ?? "").trim();
                  const estatusVal =
                    rawEstatus || ESTATUS_SEGUIMIENTO_DEFECTO;
                  return (
                    <tr
                      key={op.numero_consecutivo}
                      className={claseSemaforoSeguimiento(op, hoy)}
                    >
                      <td className="col-id">{op.numero_consecutivo}</td>
                      <td className="col-nombre">{nombreCompleto(op)}</td>
                      <td>{op.telefono_1 ?? "—"}</td>
                      <td className="col-fecha">{op.fecha_captacion ?? "—"}</td>
                      <td className="col-fecha">{op.proxima_llamada ?? "—"}</td>
                      <td>
                        <span
                          className={asesorTonoClass(op.asesor)}
                          title={op.asesor?.trim() || undefined}
                        >
                          {truncar(op.asesor, 24)}
                        </span>
                      </td>
                      <td>
                        <select
                          className="table-select-estatus"
                          aria-label={`Estatus de ${nombreCompleto(op)}`}
                          value={estatusVal}
                          disabled={patchEstatusMutation.isPending}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchEstatusMutation.mutate({
                              id: op.numero_consecutivo,
                              estatus: v,
                            });
                          }}
                        >
                          {rawEstatus &&
                            !esEstatusSeguimientoEnCatalogo(rawEstatus) && (
                              <option value={rawEstatus}>
                                {rawEstatus} (anterior)
                              </option>
                            )}
                          {ESTATUS_SEGUIMIENTO_OPCIONES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setDetallesModal({
                              id: op.numero_consecutivo,
                              nombre: nombreCompleto(op),
                              medio_captacion: op.medio_captacion ?? null,
                              num_exp_med_preventiva:
                                op.num_exp_med_preventiva ?? null,
                              notas: op.notas_seguimiento ?? "",
                            })
                          }
                        >
                          Detalles
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {(loadingContexto || isLoading) && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Cargando prospectos…</span>
        </div>
      )}
    </div>
  );
}
