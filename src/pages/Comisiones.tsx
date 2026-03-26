import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Promotor } from "../lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FilaComision {
  id: number;
  fecha: string;
  curp_operador: string | null;
  servicio: string | null;
  costo: number;
  costo_promotor: number;
  comision_promotor: number;
  comision_pagada: boolean;
  promotor: string | null;
}

interface Filtros {
  id_promotor: string;
  fecha_desde: string;
  fecha_hasta: string;
  solo_pendientes: boolean;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchPromotores(): Promise<Promotor[]> {
  const { data, error } = await supabase
    .from("promotores")
    .select("id_promotor, nombre, nick, orden, columna_servicios")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Promotor[];
}

async function fetchComisiones(filtros: Filtros): Promise<FilaComision[]> {
  let q = supabase
    .from("ventas")
    .select(
      "id, fecha, curp_operador, servicio, costo, costo_promotor, comision_promotor, comision_pagada, promotor, id_promotor",
    )
    .gte("fecha", filtros.fecha_desde)
    .lte("fecha", filtros.fecha_hasta)
    .order("fecha", { ascending: false });

  if (filtros.id_promotor) {
    q = q.eq("id_promotor", Number(filtros.id_promotor));
  }

  if (filtros.solo_pendientes) {
    q = q.eq("comision_pagada", false);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilaComision[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Comisiones() {
  const [filtros, setFiltros] = useState<Filtros>({
    id_promotor: "",
    fecha_desde: primerDiaMes(),
    fecha_hasta: hoy(),
    solo_pendientes: false,
  });
  const [buscar, setBuscar] = useState(false);

  const { data: promotores = [] } = useQuery({
    queryKey: ["promotores"],
    queryFn: fetchPromotores,
  });

  const {
    data: filas = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["comisiones", filtros],
    queryFn: () => fetchComisiones(filtros),
    enabled: buscar,
  });

  function setF<K extends keyof Filtros>(key: K, value: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [key]: value }));
  }

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!buscar) {
      setBuscar(true);
    } else {
      refetch();
    }
  }

  // Totales
  const totalCosto = filas.reduce((s, f) => s + f.costo, 0);
  const totalCostoPromotor = filas.reduce((s, f) => s + f.costo_promotor, 0);
  const totalComision = filas.reduce((s, f) => s + f.comision_promotor, 0);
  const totalPendiente = filas
    .filter((f) => !f.comision_pagada)
    .reduce((s, f) => s + f.comision_promotor, 0);

  // Agrupar por promotor para el resumen
  const resumenPorPromotor = filas.reduce<
    Record<string, { nombre: string; total: number; pendiente: number; registros: number }>
  >((acc, f) => {
    const key = f.promotor ?? "Sin promotor";
    if (!acc[key]) acc[key] = { nombre: key, total: 0, pendiente: 0, registros: 0 };
    acc[key].total += f.comision_promotor;
    acc[key].registros += 1;
    if (!f.comision_pagada) acc[key].pendiente += f.comision_promotor;
    return acc;
  }, {});

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">📊</span> Comisiones
          </h1>
          <p className="page-subtitle">
            Reporte de comisiones por promotor en un rango de fechas.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form onSubmit={handleBuscar} className="filter-card">
        <div className="filter-grid">
          <div className="form-field">
            <label>Promotor</label>
            <select
              value={filtros.id_promotor}
              onChange={(e) => setF("id_promotor", e.target.value)}
            >
              <option value="">— Todos los promotores —</option>
              {promotores.map((p) => (
                <option key={p.id_promotor} value={p.id_promotor}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Desde</label>
            <input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setF("fecha_desde", e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Hasta</label>
            <input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setF("fecha_hasta", e.target.value)}
              required
            />
          </div>

          <div className="form-field form-field-center">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filtros.solo_pendientes}
                onChange={(e) => setF("solo_pendientes", e.target.checked)}
              />
              Solo pendientes de pago
            </label>
          </div>

          <div className="form-field form-field-center">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Cargando…" : "Consultar"}
            </button>
          </div>
        </div>
      </form>

      {isError && (
        <div className="alert-error">
          Error: {(error as Error).message}
        </div>
      )}

      {/* Resumen por promotor */}
      {filas.length > 0 && (
        <>
          <div className="summary-bar" style={{ marginTop: "20px" }}>
            <div className="summary-item">
              <span className="summary-label">Registros</span>
              <span className="summary-value">{filas.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total costos</span>
              <span className="summary-value">{fmt(totalCosto)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total comisiones</span>
              <span className="summary-value summary-value--green">
                {fmt(totalComision)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Pendiente por pagar</span>
              <span
                className={`summary-value ${totalPendiente > 0 ? "summary-value--red" : "summary-value--green"}`}
              >
                {fmt(totalPendiente)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Costo a promotores</span>
              <span className="summary-value">{fmt(totalCostoPromotor)}</span>
            </div>
          </div>

          {/* Resumen por promotor */}
          {Object.keys(resumenPorPromotor).length > 1 && (
            <div className="promotor-resumen">
              <h3 className="section-subtitle" style={{ marginBottom: "10px" }}>
                Desglose por promotor
              </h3>
              <div className="promotor-chips">
                {Object.values(resumenPorPromotor).map((p) => (
                  <div key={p.nombre} className="promotor-chip">
                    <strong>{p.nombre}</strong>
                    <span>{p.registros} ventas</span>
                    <span className="calc-green">{fmt(p.total)}</span>
                    {p.pendiente > 0 && (
                      <span className="calc-red">Pend: {fmt(p.pendiente)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla detalle */}
          <div className="table-wrapper" style={{ marginTop: "16px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Operador (CURP)</th>
                  <th>Servicio</th>
                  <th>Promotor</th>
                  <th>Costo</th>
                  <th>C. Promotor</th>
                  <th>Comisión</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="col-id">{f.id}</td>
                    <td className="col-fecha">{f.fecha}</td>
                    <td className="col-curp">{f.curp_operador ?? "—"}</td>
                    <td>{f.servicio ?? "—"}</td>
                    <td>{f.promotor ?? "—"}</td>
                    <td className="col-money">{fmt(f.costo)}</td>
                    <td className="col-money">{fmt(f.costo_promotor)}</td>
                    <td className="col-money col-money--green">
                      {fmt(f.comision_promotor)}
                    </td>
                    <td>
                      <span
                        className={`badge ${f.comision_pagada ? "badge--green" : "badge--yellow"}`}
                      >
                        {f.comision_pagada ? "Pagada" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={5}>
                    <strong>TOTAL ({filas.length} registros)</strong>
                  </td>
                  <td className="col-money">
                    <strong>{fmt(totalCosto)}</strong>
                  </td>
                  <td className="col-money">
                    <strong>{fmt(totalCostoPromotor)}</strong>
                  </td>
                  <td className="col-money col-money--green">
                    <strong>{fmt(totalComision)}</strong>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {buscar && !isLoading && filas.length === 0 && !isError && (
        <div className="empty-report">
          <span>Sin resultados</span>
          <p>No hay comisiones para los filtros seleccionados.</p>
        </div>
      )}

      {isLoading && (
        <div className="loading-state" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Consultando comisiones...</span>
        </div>
      )}
    </div>
  );
}
