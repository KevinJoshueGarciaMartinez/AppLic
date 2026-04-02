import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Promotor } from "../lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FilaCurso {
  id: number;
  fecha: string;
  fecha_solicitud_curso: string | null;
  operador_nombre: string | null;
  servicio: string | null;
  promotor: string | null;
  costo: number;
  cobro: number;
  faltante: number;
  forma_pago: string;
  observaciones: string | null;
  comision_pagada: boolean;
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
    .select(
      "id, fecha, fecha_solicitud_curso, operador_nombre, servicio, promotor, costo, cobro, faltante, forma_pago, observaciones, comision_pagada",
    )
    .eq("tipo_servicio", 2)
    .gte("fecha_solicitud_curso", desde)
    .lte("fecha_solicitud_curso", hasta)
    .order("fecha_solicitud_curso", { ascending: true });

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

  const totalCosto = cursos.reduce((s, c) => s + c.costo, 0);
  const totalCobrado = cursos.reduce((s, c) => s + c.cobro, 0);
  const totalFaltante = cursos.reduce((s, c) => s + (c.faltante ?? 0), 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="ghost-btn" type="button" onClick={() => navigate("/reportes")}>
          ← Reportes
        </button>
        <div>
          <h1 className="page-title">
            <span className="page-icon">📝</span> Petición de Cursos
          </h1>
          <p className="page-subtitle">
            Ventas de tipo curso filtradas por fecha de solicitud.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form onSubmit={handleBuscar} className="filter-card">
        <div className="filter-grid">
          <div className="form-field">
            <label>Fecha solicitud (desde)</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Fecha solicitud (hasta)</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Promotor</label>
            <select
              value={idPromotor}
              onChange={(e) => setIdPromotor(e.target.value)}
            >
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
          {/* KPIs */}
          <div className="summary-bar" style={{ marginTop: "20px" }}>
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

          {/* Tabla */}
          <div className="table-wrapper" style={{ marginTop: "20px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha solicitud</th>
                  <th>Operador</th>
                  <th>Servicio</th>
                  <th>Promotor</th>
                  <th>Costo</th>
                  <th>Cobro</th>
                  <th>Faltante</th>
                  <th>Forma pago</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {cursos.map((c) => (
                  <tr key={c.id}>
                    <td className="col-id">{c.id}</td>
                    <td className="col-fecha">{c.fecha_solicitud_curso ?? "—"}</td>
                    <td>{c.operador_nombre ?? "—"}</td>
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
                    <td style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                      {c.observaciones ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={5}><strong>TOTAL</strong></td>
                  <td className="col-money"><strong>{fmt(totalCosto)}</strong></td>
                  <td className="col-money col-money--green"><strong>{fmt(totalCobrado)}</strong></td>
                  <td className={`col-money ${totalFaltante > 0 ? "col-money--red" : "col-money--green"}`}>
                    <strong>{fmt(totalFaltante)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
