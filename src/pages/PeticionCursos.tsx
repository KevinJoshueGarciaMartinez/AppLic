import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
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
  costo: number;
  cobro: number;
  faltante: number;
  forma_pago: string;
  observaciones: string | null;
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
      costo,
      cobro,
      faltante,
      forma_pago,
      observaciones,
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

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n ?? 0);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Excel export ───────────────────────────────────────────────────────────────

function exportarExcel(cursos: FilaCurso[], nombrePromotor: string) {
  const filas = cursos.map((c) => {
    const op = c.operadores;
    return {
      "Hora":                op?.hora ?? "",
      "Nombre":              op?.nombre ?? "",
      "Apellido Paterno":    op?.apellido_paterno ?? "",
      "Apellido Materno":    op?.apellido_materno ?? "",
      "Texto 228":           "",
      "Texto 169":           "",
      "Fecha Solicitud":     c.fecha_solicitud_curso ?? "",
      "Servicio":            c.servicio ?? "",
      "Texto 230":           "",
      "CURP":                op?.curp ?? "",
      "Licencia Núm.":       op?.licencia_numero ?? "",
      "Dirección":           op?.direccion ?? "",
      "Teléfono 1":          op?.telefono_1 ?? "",
      "Quién cobró curso":   op?.quien_cobro_curso ?? "",
      "Promotor":            c.promotor ?? "",
      "Escolaridad":         op?.escolaridad ?? "",
      "Licencia Vigencia":   op?.licencia_vigencia ?? "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(filas);

  // Ancho de columnas aproximado
  ws["!cols"] = [
    { wch: 8 },  // Hora
    { wch: 16 }, // Nombre
    { wch: 16 }, // Ap. Paterno
    { wch: 16 }, // Ap. Materno
    { wch: 12 }, // Texto228
    { wch: 12 }, // Texto169
    { wch: 14 }, // Fecha Solicitud
    { wch: 20 }, // Servicio
    { wch: 12 }, // Texto230
    { wch: 20 }, // CURP
    { wch: 14 }, // Licencia
    { wch: 24 }, // Dirección
    { wch: 12 }, // Teléfono
    { wch: 16 }, // Quién cobró
    { wch: 16 }, // Promotor
    { wch: 22 }, // Escolaridad
    { wch: 14 }, // Lic. Vigencia
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Petición de Cursos");

  const fecha = hoy();
  const sufijo = nombrePromotor ? `_${nombrePromotor.replace(/\s+/g, "_")}` : "";
  XLSX.writeFile(wb, `Peticion_Cursos${sufijo}_${fecha}.xlsx`);
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

  const nombrePromotor =
    promotores.find((p) => String(p.id_promotor) === idPromotor)?.nombre ?? "";

  const totalCosto = cursos.reduce((s, c) => s + c.costo, 0);
  const totalCobrado = cursos.reduce((s, c) => s + c.cobro, 0);
  const totalFaltante = cursos.reduce((s, c) => s + (c.faltante ?? 0), 0);

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
            Ventas de tipo curso con datos del expediente del operador.
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
        <div className="alert-error">Error: {(error as Error).message}</div>
      )}

      {isLoading && (
        <div className="loading-state" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Cargando...</span>
        </div>
      )}

      {!isLoading && buscar && cursos.length === 0 && !isError && (
        <div className="empty-report">
          <span>Sin resultados</span>
          <p>No hay peticiones de curso para los filtros seleccionados.</p>
        </div>
      )}

      {cursos.length > 0 && (
        <>
          {/* ── KPIs + botón Excel ── */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
            <div className="summary-bar" style={{ margin: 0, flex: 1 }}>
              <div className="summary-item">
                <span className="summary-label">Registros</span>
                <span className="summary-value">{cursos.length}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Total facturado</span>
                <span className="summary-value">{fmt(totalCosto)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Total cobrado</span>
                <span className="summary-value summary-value--green">{fmt(totalCobrado)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Faltante</span>
                <span className={`summary-value ${totalFaltante > 0 ? "summary-value--red" : "summary-value--green"}`}>
                  {fmt(totalFaltante)}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => exportarExcel(cursos, nombrePromotor)}
              style={{ whiteSpace: "nowrap" }}
            >
              ⬇️ Descargar Excel
            </button>
          </div>

          {/* ── Tabla ── */}
          <div className="table-wrapper" style={{ marginTop: "16px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha solicitud</th>
                  <th>Operador</th>
                  <th>CURP</th>
                  <th>Servicio</th>
                  <th>Promotor</th>
                  <th>Costo</th>
                  <th>Cobro</th>
                  <th>Faltante</th>
                  <th>Forma pago</th>
                </tr>
              </thead>
              <tbody>
                {cursos.map((c) => {
                  const op = c.operadores;
                  const nombreCompleto = op
                    ? [op.nombre, op.apellido_paterno, op.apellido_materno].filter(Boolean).join(" ")
                    : "—";
                  return (
                    <tr key={c.id}>
                      <td className="col-id">{c.id}</td>
                      <td className="col-fecha">{c.fecha_solicitud_curso ?? "—"}</td>
                      <td>{nombreCompleto}</td>
                      <td style={{ fontSize: "0.8em" }}>{op?.curp ?? "—"}</td>
                      <td>{c.servicio ?? "—"}</td>
                      <td>{c.promotor ?? "—"}</td>
                      <td className="col-money">{fmt(c.costo)}</td>
                      <td className="col-money col-money--green">{fmt(c.cobro)}</td>
                      <td className={`col-money ${(c.faltante ?? 0) > 0 ? "col-money--red" : "col-money--green"}`}>
                        {fmt(c.faltante ?? 0)}
                      </td>
                      <td>
                        <span className={`badge ${c.forma_pago === "Efectivo" ? "badge--gray" : "badge--blue"}`}>
                          {c.forma_pago}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={6}><strong>TOTAL ({cursos.length} registros)</strong></td>
                  <td className="col-money"><strong>{fmt(totalCosto)}</strong></td>
                  <td className="col-money col-money--green"><strong>{fmt(totalCobrado)}</strong></td>
                  <td className={`col-money ${totalFaltante > 0 ? "col-money--red" : "col-money--green"}`}>
                    <strong>{fmt(totalFaltante)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
