import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Promotor } from "../lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResumenVentas {
  fecha: string;
  total_ventas: number;
  total_cobrado: number;
  total_faltante: number;
  cantidad: number;
}

interface VentaReporte {
  id: number;
  fecha: string;
  curp_operador: string | null;
  servicio: string | null;
  promotor: string | null;
  costo: number;
  cobro: number;
  faltante: number;
  forma_pago: string;
  egreso: number;
  total_cobrado: number;
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

async function fetchReporteVentas(
  desde: string,
  hasta: string,
  idPromotor: string,
  formaPago: string,
): Promise<VentaReporte[]> {
  let q = supabase
    .from("ventas")
    .select(
      "id, fecha, curp_operador, servicio, promotor, costo, cobro, faltante, forma_pago, egreso, total_cobrado",
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (idPromotor) q = q.eq("id_promotor", Number(idPromotor));
  if (formaPago) q = q.eq("forma_pago", formaPago);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as VentaReporte[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function agruparPorFecha(ventas: VentaReporte[]): ResumenVentas[] {
  const mapa: Record<string, ResumenVentas> = {};
  for (const v of ventas) {
    if (!mapa[v.fecha]) {
      mapa[v.fecha] = {
        fecha: v.fecha,
        total_ventas: 0,
        total_cobrado: 0,
        total_faltante: 0,
        cantidad: 0,
      };
    }
    mapa[v.fecha].total_ventas += v.costo;
    mapa[v.fecha].total_cobrado += v.cobro;
    mapa[v.fecha].total_faltante += v.faltante ?? 0;
    mapa[v.fecha].cantidad += 1;
  }
  return Object.values(mapa).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "ventas" | "servicios" | "promotores";

// ── Component ─────────────────────────────────────────────────────────────────

export default function Reportes() {
  const [tab, setTab] = useState<Tab>("ventas");
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [idPromotor, setIdPromotor] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [vista, setVista] = useState<"detalle" | "resumen">("resumen");
  const [buscar, setBuscar] = useState(false);

  const { data: promotores = [] } = useQuery({
    queryKey: ["promotores"],
    queryFn: fetchPromotores,
  });

  const {
    data: ventas = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["reporte-ventas", desde, hasta, idPromotor, formaPago],
    queryFn: () => fetchReporteVentas(desde, hasta, idPromotor, formaPago),
    enabled: buscar,
  });

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!buscar) setBuscar(true);
    else refetch();
  }

  // Totales
  const totalCosto = ventas.reduce((s, v) => s + v.costo, 0);
  const totalCobrado = ventas.reduce((s, v) => s + v.cobro, 0);
  const totalFaltante = ventas.reduce((s, v) => s + (v.faltante ?? 0), 0);
  const totalEgreso = ventas.reduce((s, v) => s + (v.egreso ?? 0), 0);
  const totalNeto = ventas.reduce((s, v) => s + (v.total_cobrado ?? 0), 0);

  // Agrupaciones
  const porFecha = agruparPorFecha(ventas);

  const porServicio = ventas.reduce<Record<string, { nombre: string; cantidad: number; total: number; cobrado: number }>>(
    (acc, v) => {
      const k = v.servicio ?? "Sin servicio";
      if (!acc[k]) acc[k] = { nombre: k, cantidad: 0, total: 0, cobrado: 0 };
      acc[k].cantidad += 1;
      acc[k].total += v.costo;
      acc[k].cobrado += v.cobro;
      return acc;
    },
    {},
  );

  const porPromotor = ventas.reduce<Record<string, { nombre: string; cantidad: number; total: number; cobrado: number }>>(
    (acc, v) => {
      const k = v.promotor ?? "Sin promotor";
      if (!acc[k]) acc[k] = { nombre: k, cantidad: 0, total: 0, cobrado: 0 };
      acc[k].cantidad += 1;
      acc[k].total += v.costo;
      acc[k].cobrado += v.cobro;
      return acc;
    },
    {},
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">📋</span> Reportes
          </h1>
          <p className="page-subtitle">
            Análisis de ventas por período, servicio y promotor.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form onSubmit={handleBuscar} className="filter-card">
        <div className="filter-grid">
          <div className="form-field">
            <label>Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Hasta</label>
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
          <div className="form-field">
            <label>Forma de pago</label>
            <select
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value)}
            >
              <option value="">— Todas —</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Deposito">Depósito</option>
            </select>
          </div>
          <div className="form-field form-field-center">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Cargando…" : "Generar reporte"}
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
          <span>Generando reporte...</span>
        </div>
      )}

      {!isLoading && buscar && ventas.length === 0 && !isError && (
        <div className="empty-report">
          <span>Sin resultados</span>
          <p>No hay ventas para los filtros seleccionados.</p>
        </div>
      )}

      {ventas.length > 0 && (
        <>
          {/* KPIs */}
          <div className="summary-bar" style={{ marginTop: "20px" }}>
            <div className="summary-item">
              <span className="summary-label">Registros</span>
              <span className="summary-value">{ventas.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total facturado</span>
              <span className="summary-value">{fmt(totalCosto)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total cobrado</span>
              <span className="summary-value summary-value--green">
                {fmt(totalCobrado)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total faltante</span>
              <span
                className={`summary-value ${totalFaltante > 0 ? "summary-value--red" : "summary-value--green"}`}
              >
                {fmt(totalFaltante)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Egresos</span>
              <span className="summary-value summary-value--red">
                {fmt(totalEgreso)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Neto</span>
              <span className="summary-value summary-value--green">
                {fmt(totalNeto)}
              </span>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="tabs" style={{ marginTop: "20px" }}>
            <button
              type="button"
              className={`tab-btn${tab === "ventas" ? " tab-btn--active" : ""}`}
              onClick={() => setTab("ventas")}
            >
              Por fecha
            </button>
            <button
              type="button"
              className={`tab-btn${tab === "servicios" ? " tab-btn--active" : ""}`}
              onClick={() => setTab("servicios")}
            >
              Por servicio
            </button>
            <button
              type="button"
              className={`tab-btn${tab === "promotores" ? " tab-btn--active" : ""}`}
              onClick={() => setTab("promotores")}
            >
              Por promotor
            </button>

            {tab === "ventas" && (
              <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className={`tab-btn${vista === "resumen" ? " tab-btn--active" : ""}`}
                  onClick={() => setVista("resumen")}
                >
                  Resumen
                </button>
                <button
                  type="button"
                  className={`tab-btn${vista === "detalle" ? " tab-btn--active" : ""}`}
                  onClick={() => setVista("detalle")}
                >
                  Detalle
                </button>
              </div>
            )}
          </div>

          {/* ── Tab: Por fecha ── */}
          {tab === "ventas" && vista === "resumen" && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cant.</th>
                    <th>Facturado</th>
                    <th>Cobrado</th>
                    <th>Faltante</th>
                    <th>% cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {porFecha.map((r) => (
                    <tr key={r.fecha}>
                      <td className="col-fecha">{r.fecha}</td>
                      <td style={{ textAlign: "center" }}>{r.cantidad}</td>
                      <td className="col-money">{fmt(r.total_ventas)}</td>
                      <td className="col-money col-money--green">
                        {fmt(r.total_cobrado)}
                      </td>
                      <td
                        className={`col-money ${r.total_faltante > 0 ? "col-money--red" : "col-money--green"}`}
                      >
                        {fmt(r.total_faltante)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {r.total_ventas > 0
                          ? `${Math.round((r.total_cobrado / r.total_ventas) * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="table-total-row">
                    <td>
                      <strong>TOTAL</strong>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <strong>{ventas.length}</strong>
                    </td>
                    <td className="col-money">
                      <strong>{fmt(totalCosto)}</strong>
                    </td>
                    <td className="col-money col-money--green">
                      <strong>{fmt(totalCobrado)}</strong>
                    </td>
                    <td
                      className={`col-money ${totalFaltante > 0 ? "col-money--red" : "col-money--green"}`}
                    >
                      <strong>{fmt(totalFaltante)}</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>
                        {totalCosto > 0
                          ? `${Math.round((totalCobrado / totalCosto) * 100)}%`
                          : "—"}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {tab === "ventas" && vista === "detalle" && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th>Operador</th>
                    <th>Servicio</th>
                    <th>Promotor</th>
                    <th>Costo</th>
                    <th>Cobro</th>
                    <th>Faltante</th>
                    <th>Forma pago</th>
                    <th>Egreso</th>
                    <th>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id}>
                      <td className="col-id">{v.id}</td>
                      <td className="col-fecha">{v.fecha}</td>
                      <td className="col-curp">{v.curp_operador ?? "—"}</td>
                      <td>{v.servicio ?? "—"}</td>
                      <td>{v.promotor ?? "—"}</td>
                      <td className="col-money">{fmt(v.costo)}</td>
                      <td className="col-money col-money--green">
                        {fmt(v.cobro)}
                      </td>
                      <td
                        className={`col-money ${(v.faltante ?? 0) > 0 ? "col-money--red" : "col-money--green"}`}
                      >
                        {fmt(v.faltante ?? 0)}
                      </td>
                      <td>
                        <span
                          className={`badge ${v.forma_pago === "Efectivo" ? "badge--gray" : "badge--blue"}`}
                        >
                          {v.forma_pago}
                        </span>
                      </td>
                      <td className="col-money col-money--red">
                        {fmt(v.egreso ?? 0)}
                      </td>
                      <td className="col-money col-money--green">
                        {fmt(v.total_cobrado ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tab: Por servicio ── */}
          {tab === "servicios" && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Cantidad</th>
                    <th>Facturado</th>
                    <th>Cobrado</th>
                    <th>% cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(porServicio)
                    .sort((a, b) => b.total - a.total)
                    .map((s) => (
                      <tr key={s.nombre}>
                        <td>{s.nombre}</td>
                        <td style={{ textAlign: "center" }}>{s.cantidad}</td>
                        <td className="col-money">{fmt(s.total)}</td>
                        <td className="col-money col-money--green">
                          {fmt(s.cobrado)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {s.total > 0
                            ? `${Math.round((s.cobrado / s.total) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tab: Por promotor ── */}
          {tab === "promotores" && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Promotor</th>
                    <th>Ventas</th>
                    <th>Facturado</th>
                    <th>Cobrado</th>
                    <th>% cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(porPromotor)
                    .sort((a, b) => b.total - a.total)
                    .map((p) => (
                      <tr key={p.nombre}>
                        <td>
                          <strong>{p.nombre}</strong>
                        </td>
                        <td style={{ textAlign: "center" }}>{p.cantidad}</td>
                        <td className="col-money">{fmt(p.total)}</td>
                        <td className="col-money col-money--green">
                          {fmt(p.cobrado)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {p.total > 0
                            ? `${Math.round((p.cobrado / p.total) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
