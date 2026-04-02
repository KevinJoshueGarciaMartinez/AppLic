import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Promotor } from "../lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OperadorInfo {
  hora: string | null;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  curp: string;
  licencia_numero: string | null;
  licencia_vigencia: string | null;
  direccion: string | null;
  telefono_1: string | null;
  escolaridad: string | null;
  quien_cobro_curso: string | null;
}

interface FilaCurso {
  id: number;
  fecha: string;
  fecha_solicitud_curso: string | null;
  servicio: string | null;
  promotor: string | null;
  operadores: OperadorInfo | null;
}

// ── Fetchers ───────────────────────────────────────────────────────────────────

async function fetchPromotores(): Promise<Promotor[]> {
  const { data, error } = await supabase
    .from("promotores")
    .select("id_promotor, nombre, nick, orden, columna_servicios")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Promotor[];
}

async function fetchCursos(
  desde: string,
  hasta: string,
  idPromotor: string,
): Promise<FilaCurso[]> {
  let q = supabase
    .from("ventas")
    .select(`
      id,
      fecha,
      fecha_solicitud_curso,
      servicio,
      promotor,
      operadores!operador_id (
        hora,
        nombre,
        apellido_paterno,
        apellido_materno,
        curp,
        licencia_numero,
        licencia_vigencia,
        direccion,
        telefono_1,
        escolaridad,
        quien_cobro_curso
      )
    `)
    .eq("tipo_servicio", 2)
    .order("fecha_solicitud_curso", { ascending: true });

  if (desde) q = q.gte("fecha_solicitud_curso", desde);
  if (hasta) q = q.lte("fecha_solicitud_curso", hasta);
  if (idPromotor) q = q.eq("id_promotor", Number(idPromotor));

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilaCurso[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PeticionCursos() {
  const [, navigate] = useLocation();
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [idPromotor, setIdPromotor] = useState("");
  const [buscar, setBuscar] = useState(false);

  const { data: promotores = [] } = useQuery({
    queryKey: ["promotores"],
    queryFn: fetchPromotores,
  });

  const {
    data: cursos = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["peticion-cursos", desde, hasta, idPromotor],
    queryFn: () => fetchCursos(desde, hasta, idPromotor),
    enabled: buscar,
  });

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!buscar) setBuscar(true);
    else refetch();
  }

  return (
    <div className="page-container">
      {/* ── Cabecera ── */}
      <div className="page-header no-print">
        <button className="ghost-btn" type="button" onClick={() => navigate("/reportes")}>
          ← Reportes
        </button>
        <div>
          <h1 className="page-title">
            <span className="page-icon">📝</span> Petición de Cursos
          </h1>
          <p className="page-subtitle">
            Operadores con venta de curso registrada, enriquecida con sus datos del expediente.
          </p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <form onSubmit={handleBuscar} className="filter-card no-print">
        <div className="filter-grid">
          <div className="form-field">
            <label>Fecha solicitud (desde)</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Fecha solicitud (hasta)</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Promotor</label>
            <select value={idPromotor} onChange={(e) => setIdPromotor(e.target.value)}>
              <option value="">— Todos —</option>
              {promotores.map((p) => (
                <option key={p.id_promotor} value={p.id_promotor}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field form-field-center">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Cargando…" : "Buscar"}
            </button>
          </div>
        </div>
      </form>

      {isError && (
        <div className="alert-error no-print">Error: {(error as Error).message}</div>
      )}

      {isLoading && (
        <div className="loading-state no-print" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Cargando...</span>
        </div>
      )}

      {!isLoading && buscar && cursos.length === 0 && !isError && (
        <div className="empty-report no-print">
          <span>Sin resultados</span>
          <p>No hay peticiones de curso para los filtros seleccionados.</p>
        </div>
      )}

      {cursos.length > 0 && (
        <>
          {/* ── Encabezado de impresión ── */}
          <div className="print-only print-header">
            <h2>Petición de Cursos</h2>
            <p>
              {idPromotor
                ? `Promotor: ${promotores.find((p) => String(p.id_promotor) === idPromotor)?.nombre}`
                : "Todos los promotores"}
              {desde || hasta
                ? ` · ${desde ?? ""}${desde && hasta ? " — " : ""}${hasta ?? ""}`
                : ""}
            </p>
            <p style={{ fontSize: "0.85em", color: "#666" }}>
              Impreso el {new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}
            </p>
          </div>

          {/* ── Resumen ── */}
          <div className="summary-bar no-print" style={{ marginTop: "16px" }}>
            <div className="summary-item">
              <span className="summary-label">Registros</span>
              <span className="summary-value">{cursos.length}</span>
            </div>
          </div>

          {/* ── Tabla (landscape para imprimir) ── */}
          <div className="table-wrapper cursos-table-wrapper" style={{ marginTop: "16px" }}>
            <table className="data-table cursos-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Nombre</th>
                  <th>Ap. Paterno</th>
                  <th>Ap. Materno</th>
                  <th>Texto 228</th>
                  <th>Texto 169</th>
                  <th>Fecha solicitud</th>
                  <th>Servicio</th>
                  <th>Texto 230</th>
                  <th>CURP</th>
                  <th>Lic. núm.</th>
                  <th>Dirección</th>
                  <th>Teléfono</th>
                  <th>Quién cobró</th>
                  <th>Promotor</th>
                  <th>Escolaridad</th>
                  <th>Lic. vigencia</th>
                </tr>
              </thead>
              <tbody>
                {cursos.map((c) => {
                  const op = c.operadores;
                  return (
                    <tr key={c.id}>
                      <td>{op?.hora ?? "—"}</td>
                      <td>{op?.nombre ?? "—"}</td>
                      <td>{op?.apellido_paterno ?? "—"}</td>
                      <td>{op?.apellido_materno ?? "—"}</td>
                      <td className="celda-texto"></td>
                      <td className="celda-texto"></td>
                      <td>{c.fecha_solicitud_curso ?? "—"}</td>
                      <td>{c.servicio ?? "—"}</td>
                      <td className="celda-texto"></td>
                      <td style={{ fontSize: "0.78em" }}>{op?.curp ?? "—"}</td>
                      <td>{op?.licencia_numero ?? "—"}</td>
                      <td>{op?.direccion ?? "—"}</td>
                      <td>{op?.telefono_1 ?? "—"}</td>
                      <td>{op?.quien_cobro_curso ?? "—"}</td>
                      <td>{c.promotor ?? "—"}</td>
                      <td>{op?.escolaridad ?? "—"}</td>
                      <td>{op?.licencia_vigencia ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={17}>
                    <strong>TOTAL: {cursos.length} registro{cursos.length !== 1 ? "s" : ""}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Botón imprimir ── */}
          <div className="no-print" style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="ghost-btn" onClick={() => window.print()}>
              🖨️ Imprimir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
