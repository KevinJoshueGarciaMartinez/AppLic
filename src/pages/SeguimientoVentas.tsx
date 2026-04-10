import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Operador, OperadorInsert } from "../lib/types";

const MEDIOS_CAPTACION = [
  "Email",
  "Telefono",
  "Redes",
  "Presencial",
  "Referido",
  "Otro",
] as const;

const ESTATUS_SEGUIMIENTO = [
  "Interesado",
  "Seguimiento",
  "Visita",
  "Cerrada",
] as const;

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
> & {
  promotores?: { nombre: string | null } | null;
};

async function fetchProspectos(): Promise<FilaSeguimiento[]> {
  const { data, error } = await supabase
    .from("operadores")
    .select(
      "numero_consecutivo, nombre, apellido_paterno, apellido_materno, telefono_1, medio_captacion, fecha_captacion, proxima_llamada, estatus_seguimiento, notas_seguimiento, promotores(nombre)",
    )
    .eq("es_prospecto", true)
    .order("proxima_llamada", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilaSeguimiento[];
}

function nombreCompleto(op: FilaSeguimiento) {
  return [op.nombre, op.apellido_paterno, op.apellido_materno]
    .filter(Boolean)
    .join(" ");
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function badgeClassEstatus(s: string | null) {
  switch (s) {
    case "Interesado":
      return "badge badge--blue";
    case "Seguimiento":
      return "badge badge--amber";
    case "Visita":
      return "badge badge--yellow";
    case "Cerrada":
      return "badge badge--gray";
    default:
      return "badge badge--gray";
  }
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
  };
}

type ModalProspecto = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  telefono_1: string;
  medio_captacion: string;
  fecha_captacion: string;
  proxima_llamada: string;
  estatus_seguimiento: string;
  notas: string;
};

function emptyModalProspecto(): ModalProspecto {
  const hoy = hoyISO();
  return {
    nombre: "",
    apellido_paterno: "",
    apellido_materno: "",
    telefono_1: "",
    medio_captacion: "",
    fecha_captacion: hoy,
    proxima_llamada: hoy,
    estatus_seguimiento: "Interesado",
    notas: "",
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
    fecha_captacion: m.fecha_captacion || null,
    proxima_llamada: m.proxima_llamada.trim(),
    estatus_seguimiento: m.estatus_seguimiento || "Interesado",
    notas_seguimiento: m.notas.trim() || null,
  };
}

export default function SeguimientoVentas() {
  const queryClient = useQueryClient();
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [diaFiltro, setDiaFiltro] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalForm, setModalForm] = useState<ModalProspecto>(emptyModalProspecto);
  const [modalError, setModalError] = useState<string | null>(null);

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["seguimiento_operadores"],
    queryFn: fetchProspectos,
  });

  const hoy = hoyISO();

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

  useEffect(() => {
    if (!modalAbierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalAbierto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalAbierto]);

  function abrirModal() {
    insertMutation.reset();
    setModalForm(emptyModalProspecto());
    setModalError(null);
    setModalAbierto(true);
  }

  function setModal<K extends keyof ModalProspecto>(key: K, value: ModalProspecto[K]) {
    setModalForm((prev) => ({ ...prev, [key]: value }));
  }

  function guardarProspecto(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (!modalForm.nombre.trim()) {
      setModalError("El nombre es obligatorio.");
      return;
    }
    if (!modalForm.proxima_llamada.trim()) {
      setModalError("La próxima llamada es obligatoria para poder filtrar y ordenar el seguimiento.");
      return;
    }
    insertMutation.mutate(modalToInsert(modalForm));
  }

  const filas = useMemo(() => {
    let rows = [...data];
    if (soloPendientes) {
      rows = rows.filter((r) => r.estatus_seguimiento !== "Cerrada");
    }
    if (diaFiltro) {
      rows = rows.filter((r) => r.proxima_llamada === diaFiltro);
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
  }, [data, soloPendientes, diaFiltro, hoy]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">📞</span> Seguimiento de ventas
          </h1>
          <p className="page-subtitle">
            Prospectos registrados como operadores ligeros. Orden por próxima
            llamada (vencidas primero). Al formalizar, completa CURP en el
            expediente y desmarca «Prospecto».
          </p>
        </div>
        <button className="btn-primary" type="button" onClick={abrirModal}>
          Registrar prospecto
        </button>
      </div>

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
                  <label>Medio de captación</label>
                  <select
                    value={modalForm.medio_captacion}
                    onChange={(e) => setModal("medio_captacion", e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {MEDIOS_CAPTACION.map((m) => (
                      <option key={m} value={m}>
                        {m === "Telefono"
                          ? "Teléfono"
                          : m === "Redes"
                            ? "Redes sociales"
                            : m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Fecha de captación</label>
                  <input
                    type="date"
                    value={modalForm.fecha_captacion}
                    onChange={(e) => setModal("fecha_captacion", e.target.value)}
                  />
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
                    {ESTATUS_SEGUIMIENTO.map((s) => (
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

      <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <label className="checkbox-label" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          Ocultar cerrados
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
        <span className="record-count">
          {isLoading
            ? "Cargando…"
            : `${filas.length} prospecto${filas.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {isError && (
        <div className="alert-error">
          Error al cargar: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Captación</th>
                <th>Fecha captación</th>
                <th>Próx. llamada</th>
                <th>Estatus</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty">
                    No hay prospectos con estos filtros.
                  </td>
                </tr>
              ) : (
                filas.map((op) => {
                  const vencida =
                    op.proxima_llamada != null &&
                    op.proxima_llamada < hoy &&
                    op.estatus_seguimiento !== "Cerrada";
                  return (
                    <tr
                      key={op.numero_consecutivo}
                      className={vencida ? "row-seguimiento-vencido" : undefined}
                    >
                      <td className="col-id">{op.numero_consecutivo}</td>
                      <td className="col-nombre">{nombreCompleto(op)}</td>
                      <td>{op.telefono_1 ?? "—"}</td>
                      <td>
                        {op.medio_captacion
                          ? op.medio_captacion === "Telefono"
                            ? "Teléfono"
                            : op.medio_captacion === "Redes"
                              ? "Redes"
                              : op.medio_captacion
                          : "—"}
                      </td>
                      <td className="col-fecha">{op.fecha_captacion ?? "—"}</td>
                      <td className="col-fecha">{op.proxima_llamada ?? "—"}</td>
                      <td>
                        <span className={badgeClassEstatus(op.estatus_seguimiento)}>
                          {op.estatus_seguimiento ?? "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          maxWidth: "14rem",
                          fontSize: "0.85rem",
                          color: "#64748b",
                        }}
                      >
                        {op.notas_seguimiento
                          ? op.notas_seguimiento.length > 80
                            ? `${op.notas_seguimiento.slice(0, 80)}…`
                            : op.notas_seguimiento
                          : "—"}
                      </td>
                      <td>
                        <Link
                          href={`/operadores/${op.numero_consecutivo}?from=seguimiento`}
                        >
                          <button className="btn-edit" type="button">
                            Expediente
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Cargando prospectos…</span>
        </div>
      )}
    </div>
  );
}
