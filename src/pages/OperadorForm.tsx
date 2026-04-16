import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import {
  fetchSaldoFavorWallet,
  fetchSaldoEnContraDeuda,
  fetchMovimientosSaldo,
} from "../lib/saldoOperador";
import type { Operador, OperadorInsert, Promotor } from "../lib/types";
import {
  MEDIOS_CAPTACION,
  etiquetaMedioCaptacion,
  esMedioCaptacionCatalogoActual,
} from "../lib/mediosCaptacion";
import {
  ESTATUS_SEGUIMIENTO_DEFECTO,
  ESTATUS_SEGUIMIENTO_OPCIONES,
  esEstatusSeguimientoEnCatalogo,
} from "../lib/estatusSeguimiento";
import HistorialVentasOperador from "../components/HistorialVentasOperador";

/** Pestaña «Ventas» (historial) antes de «Saldo»; índices 0–4 son fijos. */
const TAB_IDX_VENTAS = 5;
const TAB_IDX_SALDO = 6;

function fmtSaldo(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

// ── fetch individual ──────────────────────────────────────────────────────────
async function fetchOperador(id: number): Promise<Operador> {
  const { data, error } = await supabase
    .from("operadores")
    .select("*")
    .eq("numero_consecutivo", id)
    .single();
  if (error) throw new Error(error.message);
  return data as Operador;
}

async function fetchPromotores(): Promise<Promotor[]> {
  const { data, error } = await supabase
    .from("promotores")
    .select("id_promotor, nombre, nick, orden, columna_servicios")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Promotor[];
}

// ── helpers ───────────────────────────────────────────────────────────────────
const ESCOLARIDADES = [
  "Primaria",
  "Secundaria",
  "Preparatoria",
  "Técnico",
  "Licenciatura",
  "Posgrado",
];

const MEDIOS_SOLICITUD = [
  "Presencial",
  "WhatsApp",
  "Llamada",
  "Correo",
  "Referido",
];

const FORMAS_COBRO = ["Efectivo", "Transferencia", "Tarjeta", "Depósito"];

// ── default empty form ────────────────────────────────────────────────────────
function emptyForm(): OperadorInsert {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    nombre: "",
    apellido_paterno: null,
    apellido_materno: null,
    curp: "",
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
    es_prospecto: false,
    medio_captacion: null,
    fecha_captacion: new Date().toISOString().slice(0, 10),
    proxima_llamada: null,
    estatus_seguimiento: null,
    notas_seguimiento: null,
    asesor: null,
  };
}

function fromSeguimientoQuery(): boolean {
  return new URLSearchParams(window.location.search).get("from") === "seguimiento";
}

// ── component ─────────────────────────────────────────────────────────────────
interface Props {
  id?: number;
}

const TABS_FIJAS = [
  "Datos personales",
  "Documentación",
  "Licencia y médico",
  "Cita SCT",
  "Curso",
] as const;

export default function OperadorForm({ id }: Props) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const isNew = id == null;
  const [activeTab, setActiveTab] = useState(0);
  const [form, setForm] = useState<OperadorInsert>(emptyForm());
  const [guardado, setGuardado] = useState(false);
  const [errorCliente, setErrorCliente] = useState<string | null>(null);

  // Load existing record
  const { isLoading: loadingOp, data: operadorData } = useQuery({
    queryKey: ["operador", id],
    queryFn: () => fetchOperador(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (operadorData) {
      const { numero_consecutivo, created_at, updated_at, promotores, ...rest } = operadorData;
      setForm({
        ...(rest as OperadorInsert),
        curp: rest.curp ?? "",
      } as OperadorInsert);
    }
  }, [operadorData]);

  useEffect(() => {
    if (!isNew) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("prospecto") !== "1") return;
    const hoy = new Date().toISOString().slice(0, 10);
    setForm((prev) => ({
      ...prev,
      es_prospecto: true,
      estatus_seguimiento: ESTATUS_SEGUIMIENTO_DEFECTO,
      fecha_captacion: hoy,
      proxima_llamada: hoy,
      curp: "",
    }));
  }, [isNew]);

  useEffect(() => {
    if (isNew || !id) return;
    const h = window.location.hash;
    if (h !== "#historial-ventas-operador" && h !== "#ventas") return;
    setActiveTab(TAB_IDX_VENTAS);
    const t = window.setTimeout(() => {
      document
        .getElementById("historial-ventas-operador")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(t);
  }, [id, isNew]);

  // Promotores list
  const { data: promotores = [] } = useQuery({
    queryKey: ["promotores"],
    queryFn: fetchPromotores,
  });

  const {
    data: saldosOp,
    isLoading: saldosLoading,
  } = useQuery({
    queryKey: ["operador_saldos", id],
    queryFn: async () => {
      if (!id) return { favor: 0, contra: 0 };
      const [favor, contra] = await Promise.all([
        fetchSaldoFavorWallet(id),
        fetchSaldoEnContraDeuda(id),
      ]);
      return { favor, contra };
    },
    enabled: !isNew && !!id,
  });

  const { data: movimientosSaldo = [] } = useQuery({
    queryKey: ["operador_saldo_movs", id],
    queryFn: () => fetchMovimientosSaldo(id!),
    enabled: !isNew && !!id,
  });

  // Save mutation
  const mutation = useMutation({
    mutationFn: async (payload: OperadorInsert) => {
      if (isNew) {
        const { error } = await supabase.from("operadores").insert(payload);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("operadores")
          .update(payload)
          .eq("numero_consecutivo", id!);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operadores"] });
      queryClient.invalidateQueries({ queryKey: ["seguimiento_operadores"] });
      if (!isNew) {
        queryClient.invalidateQueries({ queryKey: ["operador", id] });
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
      if (isNew) {
        navigate(fromSeguimientoQuery() ? "/seguimiento" : "/operadores");
      }
    },
  });

  function set<K extends keyof OperadorInsert>(key: K, value: OperadorInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorCliente(null);
    if (form.es_prospecto) {
      if (!(form.proxima_llamada?.trim())) {
        setErrorCliente("La próxima llamada es obligatoria mientras sea prospecto (sirve para filtros y orden en Seguimiento).");
        return;
      }
    } else {
      const c = form.curp?.trim() ?? "";
      if (!c) {
        setErrorCliente("La CURP es obligatoria al formalizar el operador (desmarca «Prospecto» solo cuando ya tengas CURP).");
        return;
      }
    }
    const payload: OperadorInsert = {
      ...form,
      fecha_captacion: isNew
        ? (form.fecha_captacion || new Date().toISOString().slice(0, 10))
        : form.fecha_captacion,
      curp: form.es_prospecto
        ? (form.curp?.trim() || null)
        : (form.curp ?? "").trim().toUpperCase(),
      medio_captacion: form.medio_captacion?.trim() || null,
      notas_seguimiento: form.notas_seguimiento?.trim() || null,
      asesor: form.asesor?.trim() || null,
    };
    mutation.mutate(payload);
  }

  const volverHref = fromSeguimientoQuery() ? "/seguimiento" : "/operadores";

  const tabs: string[] = isNew
    ? [...TABS_FIJAS]
    : [...TABS_FIJAS, "Ventas", "Saldo"];

  if (!isNew && loadingOp) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner" />
          <span>Cargando operador...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page-container"
      key={isNew ? "operador-nuevo" : `operador-${id}`}
    >
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="btn-back" onClick={() => navigate(volverHref)}>
            ← {fromSeguimientoQuery() ? "Volver a Seguimiento" : "Volver a Operadores"}
          </button>
          <h1 className="page-title">
            <span className="page-icon">👤</span>
            {isNew ? "Nuevo Operador" : `Operador #${id}`}
          </h1>
          {!isNew && (
            <p className="page-subtitle">
              {[form.nombre, form.apellido_paterno, form.apellido_materno]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
        </div>
      </div>

      {errorCliente && (
        <div className="alert-error">{errorCliente}</div>
      )}
      {mutation.isError && (
        <div className="alert-error">
          Error al guardar: {(mutation.error as Error).message}
        </div>
      )}
      {guardado && (
        <div className="alert-success">Registro guardado correctamente.</div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            className={`tab-btn${activeTab === i ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab(i)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="record-form">
        {/* ── Tab 0: Datos personales ── */}
        {activeTab === 0 && (
          <div className="form-section">
            <h3 className="section-subtitle">Seguimiento comercial</h3>
            <div className="checkbox-grid" style={{ marginBottom: "1rem" }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!form.es_prospecto}
                  onChange={(e) => set("es_prospecto", e.target.checked)}
                />
                Prospecto (registro ligero, CURP opcional)
              </label>
            </div>
            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>Medio de captación</label>
                <select
                  value={form.medio_captacion ?? ""}
                  onChange={(e) =>
                    set("medio_captacion", e.target.value || null)
                  }
                >
                  <option value="">— Seleccionar —</option>
                  {form.medio_captacion != null &&
                    form.medio_captacion !== "" &&
                    !esMedioCaptacionCatalogoActual(form.medio_captacion) && (
                      <option value={form.medio_captacion}>
                        {etiquetaMedioCaptacion(form.medio_captacion)} (anterior)
                      </option>
                    )}
                  {MEDIOS_CAPTACION.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Fecha de captación (automática)</label>
                <input
                  type="date"
                  value={form.fecha_captacion ?? ""}
                  disabled
                />
                <span className="field-hint">
                  Se registra automáticamente con la fecha de alta.
                </span>
              </div>
              <div className="form-field">
                <label>
                  Próxima llamada
                  {form.es_prospecto ? " *" : ""}
                </label>
                <input
                  type="date"
                  value={form.proxima_llamada ?? ""}
                  onChange={(e) =>
                    set("proxima_llamada", e.target.value || null)
                  }
                  required={!!form.es_prospecto}
                />
              </div>
              <div className="form-field">
                <label>Estatus de seguimiento</label>
                <select
                  value={form.estatus_seguimiento ?? ""}
                  onChange={(e) =>
                    set("estatus_seguimiento", e.target.value || null)
                  }
                >
                  <option value="">— Sin definir —</option>
                  {(() => {
                    const raw = (form.estatus_seguimiento ?? "").trim();
                    return (
                      <>
                        {raw &&
                          !esEstatusSeguimientoEnCatalogo(raw) && (
                            <option value={raw}>{raw} (anterior)</option>
                          )}
                        {ESTATUS_SEGUIMIENTO_OPCIONES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </>
                    );
                  })()}
                </select>
              </div>
            </div>
            <div className="form-field form-field-full">
              <label>Notas de seguimiento</label>
              <textarea
                value={form.notas_seguimiento ?? ""}
                onChange={(e) =>
                  set("notas_seguimiento", e.target.value || null)
                }
                rows={2}
                placeholder="Recordatorios para la próxima llamada…"
              />
            </div>
            <div className="form-field form-field-full">
              <label>Asesor</label>
              <input
                type="text"
                value={form.asesor ?? ""}
                onChange={(e) => set("asesor", e.target.value || null)}
                maxLength={120}
                placeholder="Quién da seguimiento al prospecto"
              />
            </div>

            <h3 className="section-subtitle" style={{ marginTop: "1.5rem" }}>
              Datos personales
            </h3>
            <div className="form-grid form-grid-3">
              <div className="form-field">
                <label>Nombre *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label>Apellido paterno</label>
                <input
                  type="text"
                  value={form.apellido_paterno ?? ""}
                  onChange={(e) => set("apellido_paterno", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Apellido materno</label>
                <input
                  type="text"
                  value={form.apellido_materno ?? ""}
                  onChange={(e) => set("apellido_materno", e.target.value || null)}
                />
              </div>
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>CURP{form.es_prospecto ? " (opcional en prospecto)" : " *"}</label>
                <input
                  type="text"
                  value={form.curp ?? ""}
                  onChange={(e) => set("curp", e.target.value.toUpperCase())}
                  maxLength={18}
                  required={!form.es_prospecto}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div className="form-field">
                <label>Promotor</label>
                <select
                  value={form.id_promotor ?? ""}
                  onChange={(e) =>
                    set("id_promotor", e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">— Sin promotor —</option>
                  {promotores.map((p) => (
                    <option key={p.id_promotor} value={p.id_promotor}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid form-grid-3">
              <div className="form-field">
                <label>Teléfono 1</label>
                <input
                  type="tel"
                  value={form.telefono_1 ?? ""}
                  onChange={(e) => set("telefono_1", e.target.value || null)}
                  maxLength={10}
                />
              </div>
              <div className="form-field">
                <label>Teléfono 2</label>
                <input
                  type="tel"
                  value={form.telefono_2 ?? ""}
                  onChange={(e) => set("telefono_2", e.target.value || null)}
                  maxLength={10}
                />
              </div>
              <div className="form-field">
                <label>Teléfono 3</label>
                <input
                  type="tel"
                  value={form.telefono_3 ?? ""}
                  onChange={(e) => set("telefono_3", e.target.value || null)}
                  maxLength={10}
                />
              </div>
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>Escolaridad</label>
                <select
                  value={form.escolaridad ?? ""}
                  onChange={(e) => set("escolaridad", e.target.value || null)}
                >
                  <option value="">— Seleccionar —</option>
                  {ESCOLARIDADES.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Antigüedad necesaria</label>
                <input
                  type="date"
                  value={form.antiguedad_necesaria ?? ""}
                  onChange={(e) =>
                    set("antiguedad_necesaria", e.target.value || null)
                  }
                />
              </div>
            </div>

            <div className="form-field form-field-full">
              <label>Dirección</label>
              <textarea
                value={form.direccion ?? ""}
                onChange={(e) => set("direccion", e.target.value || null)}
                rows={2}
              />
            </div>

          </div>
        )}

        {/* ── Tab 1: Documentación ── */}
        {activeTab === 1 && (
          <div className="form-section">
            <h3 className="section-subtitle">Documentos del operador</h3>
            <div className="checkbox-grid">
              {(
                [
                  ["acta", "Acta de nacimiento"],
                  ["identificacion", "Identificación oficial"],
                  ["comprobante_domicilio", "Comprobante de domicilio"],
                  ["formato_lleno_firmado", "Formato lleno y firmado"],
                  ["pago_derechos", "Pago de derechos"],
                ] as [keyof OperadorInsert, string][]
              ).map(([key, label]) => (
                <label key={key} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={(e) =>
                      set(key, e.target.checked as OperadorInsert[typeof key])
                    }
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="form-field form-field-full" style={{ marginTop: "1.25rem" }}>
              <label>Trámite a realizar</label>
              <input
                type="text"
                value={form.tramite_a_realizar ?? ""}
                onChange={(e) => set("tramite_a_realizar", e.target.value || null)}
              />
            </div>
          </div>
        )}

        {/* ── Tab 2: Licencia y médico ── */}
        {activeTab === 2 && (
          <div className="form-section">
            <h3 className="section-subtitle">Expediente médico preventivo</h3>
            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>Número de expediente méd. prev.</label>
                <input
                  type="text"
                  value={form.num_exp_med_preventiva ?? ""}
                  onChange={(e) =>
                    set("num_exp_med_preventiva", e.target.value || null)
                  }
                />
              </div>
            </div>

            <h3 className="section-subtitle" style={{ marginTop: "1.5rem" }}>
              Licencia
            </h3>
            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>Número de licencia</label>
                <input
                  type="text"
                  value={form.licencia_numero ?? ""}
                  onChange={(e) => set("licencia_numero", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Vigencia</label>
                <input
                  type="date"
                  value={form.licencia_vigencia ?? ""}
                  onChange={(e) => set("licencia_vigencia", e.target.value || null)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 3: Cita SCT ── */}
        {activeTab === 3 && (
          <div className="form-section">
            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>Fecha solicitada (cita)</label>
                <input
                  type="date"
                  value={form.cita_fecha_solicitada ?? ""}
                  onChange={(e) =>
                    set("cita_fecha_solicitada", e.target.value || null)
                  }
                />
              </div>
              <div className="form-field">
                <label>Fecha asignada (cita)</label>
                <input
                  type="date"
                  value={form.cita_fecha_asignada ?? ""}
                  onChange={(e) =>
                    set("cita_fecha_asignada", e.target.value || null)
                  }
                />
              </div>
              <div className="form-field">
                <label>Contraseña LFD</label>
                <input
                  type="text"
                  value={form.contrasena_lfd ?? ""}
                  onChange={(e) => set("contrasena_lfd", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Cobro derechos EAP/SCT</label>
                <input
                  type="text"
                  value={form.cobro_derechos_eap_sct ?? ""}
                  onChange={(e) =>
                    set("cobro_derechos_eap_sct", e.target.value || null)
                  }
                />
              </div>
              <div className="form-field">
                <label>Forma de cobro (cita)</label>
                <select
                  value={form.forma_cobro_cita ?? ""}
                  onChange={(e) => set("forma_cobro_cita", e.target.value || null)}
                >
                  <option value="">— Seleccionar —</option>
                  {FORMAS_COBRO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="checkbox-grid" style={{ marginTop: "1rem" }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!form.hoja_ayuda_pago_ventanilla}
                  onChange={(e) =>
                    set("hoja_ayuda_pago_ventanilla", e.target.checked)
                  }
                />
                Hoja ayuda pago en ventanilla
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!form.estatus_progreso_cita}
                  onChange={(e) => set("estatus_progreso_cita", e.target.checked)}
                />
                En progreso
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!form.estatus_concluido_cita}
                  onChange={(e) => set("estatus_concluido_cita", e.target.checked)}
                />
                Concluido
              </label>
            </div>

            <h3 className="section-subtitle" style={{ marginTop: "1.5rem" }}>
              Traslado
            </h3>
            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>Fecha de traslado</label>
                <input
                  type="date"
                  value={form.fecha_traslado ?? ""}
                  onChange={(e) => set("fecha_traslado", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Hora de encuentro</label>
                <input
                  type="time"
                  value={form.hora_encuentro ?? ""}
                  onChange={(e) => set("hora_encuentro", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Punto de reunión</label>
                <input
                  type="text"
                  value={form.punto_reunion ?? ""}
                  onChange={(e) => set("punto_reunion", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Forma de cobro (traslado)</label>
                <select
                  value={form.forma_cobro_traslado ?? ""}
                  onChange={(e) =>
                    set("forma_cobro_traslado", e.target.value || null)
                  }
                >
                  <option value="">— Seleccionar —</option>
                  {FORMAS_COBRO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-field form-field-full">
              <label>Observaciones del traslado</label>
              <textarea
                rows={2}
                value={form.observaciones_traslado ?? ""}
                onChange={(e) =>
                  set("observaciones_traslado", e.target.value || null)
                }
              />
            </div>
          </div>
        )}

        {/* ── Tab 4: Curso ── */}
        {activeTab === 4 && (
          <div className="form-section">
            <div className="form-grid form-grid-2">
              <div className="form-field">
                <label>Medio de solicitud del curso</label>
                <select
                  value={form.medio_solicitud_curso ?? ""}
                  onChange={(e) =>
                    set("medio_solicitud_curso", e.target.value || null)
                  }
                >
                  <option value="">— Seleccionar —</option>
                  {MEDIOS_SOLICITUD.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Fecha en que se solicitó el curso</label>
                <input
                  type="date"
                  value={form.fecha_solicitud_curso ?? ""}
                  onChange={(e) =>
                    set("fecha_solicitud_curso", e.target.value || null)
                  }
                />
              </div>
              <div className="form-field">
                <label>Destinatario de la constancia</label>
                <input
                  type="text"
                  value={form.destinatario_constancia ?? ""}
                  onChange={(e) =>
                    set("destinatario_constancia", e.target.value || null)
                  }
                />
              </div>
              <div className="form-field">
                <label>Horas requeridas</label>
                <input
                  type="text"
                  value={form.horas_requeridas ?? ""}
                  onChange={(e) => set("horas_requeridas", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Quién cobró el curso</label>
                <input
                  type="text"
                  value={form.quien_cobro_curso ?? ""}
                  onChange={(e) => set("quien_cobro_curso", e.target.value || null)}
                />
              </div>
              <div className="form-field">
                <label>Forma de cobro (curso)</label>
                <select
                  value={form.forma_cobro_curso ?? ""}
                  onChange={(e) => set("forma_cobro_curso", e.target.value || null)}
                >
                  <option value="">— Seleccionar —</option>
                  {FORMAS_COBRO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="checkbox-grid" style={{ marginTop: "1rem" }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!form.entregado}
                  onChange={(e) => set("entregado", e.target.checked)}
                />
                Entregado
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!form.estatus_progreso_curso}
                  onChange={(e) =>
                    set("estatus_progreso_curso", e.target.checked)
                  }
                />
                En progreso
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!form.estatus_concluido_curso}
                  onChange={(e) =>
                    set("estatus_concluido_curso", e.target.checked)
                  }
                />
                Concluido
              </label>
            </div>

            {form.entregado && (
              <div className="form-grid form-grid-2" style={{ marginTop: "1rem" }}>
                <div className="form-field">
                  <label>Fecha de entrega</label>
                  <input
                    type="date"
                    value={form.entregado_fecha ?? ""}
                    onChange={(e) =>
                      set("entregado_fecha", e.target.value || null)
                    }
                  />
                </div>
                <div className="form-field">
                  <label>Recibió</label>
                  <input
                    type="text"
                    value={form.entregado_recibio ?? ""}
                    onChange={(e) =>
                      set("entregado_recibio", e.target.value || null)
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {!isNew && activeTab === TAB_IDX_VENTAS && (
          <div className="form-section">
            {id != null && <HistorialVentasOperador operadorId={id} />}
          </div>
        )}

        {!isNew && activeTab === TAB_IDX_SALDO && (
          <div className="form-section">
            <div className="venta-saldos-cards operador-saldo-resumen" style={{ marginBottom: "1.25rem" }}>
              <div className="saldo-mini-card saldo-mini-card--favor">
                <span className="saldo-mini-card__titulo">Saldo a favor</span>
                <span className="saldo-mini-card__monto">
                  {saldosLoading ? "…" : fmtSaldo(saldosOp?.favor ?? 0)}
                </span>
                <span className="saldo-mini-card__hint">Suma de movimientos (abonos − aplicaciones)</span>
              </div>
              <div className="saldo-mini-card saldo-mini-card--contra">
                <span className="saldo-mini-card__titulo">Saldo en contra</span>
                <span className="saldo-mini-card__monto">
                  {saldosLoading ? "…" : fmtSaldo(saldosOp?.contra ?? 0)}
                </span>
                <span className="saldo-mini-card__hint">Suma de faltantes en ventas del operador</span>
              </div>
            </div>
            <p className="field-hint" style={{ marginBottom: "1.25rem" }}>
              Los abonos a favor se registran desde <strong>Ventas</strong> al editar o crear una venta del
              operador, para vincularlos al ticket.
            </p>

            <div className="form-group-title">Historial de movimientos</div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th className="col-money col-money--center">Importe</th>
                    <th>Concepto</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosSaldo.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: "#64748b" }}>
                        Sin movimientos registrados.
                      </td>
                    </tr>
                  ) : (
                    movimientosSaldo.map((m) => (
                      <tr key={m.id}>
                        <td className="col-fecha">
                          {new Date(m.created_at).toLocaleString("es-MX", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td>
                          {m.tipo === "abono"
                            ? "Abono"
                            : m.tipo === "aplicacion_ticket"
                              ? "Aplicación a ticket"
                              : m.tipo}
                        </td>
                        <td className="col-money col-money--center">
                          {fmtSaldo(Number(m.importe))}
                        </td>
                        <td>{m.concepto ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(volverHref)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? "Guardando…"
              : isNew
              ? "Crear Operador"
              : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
