import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Promotor } from "../lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FilaComision {
  id: number;
  fecha: string;
  fecha_pago: string | null;
  operador_id: number | null;
  operador_nombre: string | null;
  servicio: string | null;
  costo: number;
  costo_promotor: number;
  comision_pagada: boolean;
  promotor: string | null;
  id_promotor: number | null;
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
      "id, fecha, fecha_pago, operador_id, operador_nombre, servicio, costo, costo_promotor, comision_pagada, promotor, id_promotor",
    )
    .order("fecha", { ascending: false });

  // Fechas son opcionales: solo aplican si están definidas
  if (filtros.fecha_desde) q = q.gte("fecha", filtros.fecha_desde);
  if (filtros.fecha_hasta) q = q.lte("fecha", filtros.fecha_hasta);

  if (filtros.id_promotor) q = q.eq("id_promotor", Number(filtros.id_promotor));
  if (filtros.solo_pendientes) q = q.eq("comision_pagada", false);

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
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Por defecto: solo pendientes, sin filtro de fechas (todas las fechas)
  const [filtros, setFiltros] = useState<Filtros>({
    id_promotor: "",
    fecha_desde: "",
    fecha_hasta: "",
    solo_pendientes: true,
  });

  // Carga automática al entrar
  const [buscar, setBuscar] = useState(true);
  const [pagado, setPagado] = useState(false);

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

  function handleSoloPendientesChange(checked: boolean) {
    setFiltros((prev) => ({
      ...prev,
      solo_pendientes: checked,
      // Al activar pendientes, quitar filtro de fechas; al desactivar, poner mes actual
      fecha_desde: checked ? "" : primerDiaMes(),
      fecha_hasta: checked ? "" : hoy(),
    }));
  }

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setPagado(false);
    if (!buscar) setBuscar(true);
    else refetch();
  }

  // ── Pago de comisiones ────────────────────────────────────────────────────

  const pendientes = filas.filter((f) => !f.comision_pagada);

  const pagarMutation = useMutation({
    mutationFn: async () => {
      const ids = pendientes.map((f) => f.id);
      if (ids.length === 0) throw new Error("No hay comisiones pendientes.");
      const fechaPago = hoy();
      const { error } = await supabase
        .from("ventas")
        .update({ comision_pagada: true, fecha_pago: fechaPago })
        .in("id", ids);
      if (error) throw new Error(error.message);
      return ids.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comisiones"] });
      refetch().then(() => {
        setPagado(true);
        setTimeout(() => window.print(), 300);
      });
    },
  });

  function handlePagar() {
    if (pendientes.length === 0) return;
    if (!filtros.id_promotor) {
      alert("Selecciona un promotor específico antes de registrar el pago.\n\nEl pago de comisiones se realiza por promotor, no a todos a la vez.");
      return;
    }
    const nombres = [...new Set(pendientes.map((f) => f.promotor ?? "Sin nombre"))].join(", ");
    const confirmado = window.confirm(
      `¿Marcar ${pendientes.length} comisión(es) como pagadas?\n\nPromotor(es): ${nombres}\nTotal: ${fmt(pendientes.reduce((s, f) => s + f.costo_promotor, 0))}\nFecha de pago: ${hoy()}`,
    );
    if (confirmado) pagarMutation.mutate();
  }

  // ── Totales ───────────────────────────────────────────────────────────────

  const totalCosto = filas.reduce((s, f) => s + f.costo, 0);
  const totalComision = filas.reduce((s, f) => s + f.costo_promotor, 0);
  const totalPendiente = pendientes.reduce((s, f) => s + f.costo_promotor, 0);

  const resumenPorPromotor = filas.reduce<
    Record<string, { nombre: string; total: number; pendiente: number; registros: number }>
  >((acc, f) => {
    const key = f.promotor ?? "Sin promotor";
    if (!acc[key]) acc[key] = { nombre: key, total: 0, pendiente: 0, registros: 0 };
    acc[key].total += f.costo_promotor;
    acc[key].registros += 1;
    if (!f.comision_pagada) acc[key].pendiente += f.costo_promotor;
    return acc;
  }, {});

  // Descripción del filtro de fechas activo
  const descFechas =
    filtros.fecha_desde && filtros.fecha_hasta
      ? `${filtros.fecha_desde} — ${filtros.fecha_hasta}`
      : filtros.fecha_desde
        ? `Desde ${filtros.fecha_desde}`
        : filtros.fecha_hasta
          ? `Hasta ${filtros.fecha_hasta}`
          : "Todas las fechas";

  return (
    <div className="page-container">
      {/* ── Cabecera (se oculta al imprimir) ── */}
      <div className="page-header no-print">
        <button className="ghost-btn" type="button" onClick={() => navigate("/reportes")}>
          ← Reportes
        </button>
        <div>
          <h1 className="page-title">
            <span className="page-icon">📊</span> Comisiones
          </h1>
          <p className="page-subtitle">
            Reporte de comisiones por promotor en un rango de fechas.
          </p>
        </div>
      </div>

      {/* ── Filtros (se ocultan al imprimir) ── */}
      <form onSubmit={handleBuscar} className="filter-card no-print">
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
            <label>Desde {filtros.solo_pendientes && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span>}</label>
            <input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setF("fecha_desde", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label>Hasta {filtros.solo_pendientes && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span>}</label>
            <input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setF("fecha_hasta", e.target.value)}
            />
          </div>

          <div className="form-field form-field-center">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filtros.solo_pendientes}
                onChange={(e) => handleSoloPendientesChange(e.target.checked)}
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
        <div className="alert-error no-print">
          Error: {(error as Error).message}
        </div>
      )}

      {isLoading && (
        <div className="loading-state no-print" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Consultando comisiones...</span>
        </div>
      )}

      {buscar && !isLoading && filas.length === 0 && !isError && (
        <div className="empty-report no-print">
          <span>Sin resultados</span>
          <p>No hay comisiones para los filtros seleccionados.</p>
        </div>
      )}

      {filas.length > 0 && (
        <>
          {/* ── Encabezado de impresión (solo visible al imprimir) ── */}
          <div className="print-only print-header">
            <h2>Reporte de Comisiones</h2>
            <p>
              {filtros.id_promotor
                ? `Promotor: ${promotores.find((p) => String(p.id_promotor) === filtros.id_promotor)?.nombre ?? filtros.id_promotor}`
                : "Todos los promotores"}
              {" · "}
              {filtros.solo_pendientes ? "Solo pendientes" : "Todos los estados"}
              {" · "}
              {descFechas}
            </p>
            <p style={{ fontSize: "0.85em", color: "#666" }}>
              Impreso el {new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}
              {pagado && ` · Pagado el ${hoy()}`}
            </p>
          </div>

          {/* ── KPIs ── */}
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
              <span className="summary-value summary-value--green">{fmt(totalComision)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Pendiente por pagar</span>
              <span className={`summary-value ${totalPendiente > 0 ? "summary-value--red" : "summary-value--green"}`}>
                {fmt(totalPendiente)}
              </span>
            </div>
          </div>

          {/* ── Resumen por promotor ── */}
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

          {/* ── Tabla detalle ── */}
          <div className="table-wrapper" style={{ marginTop: "16px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Operador</th>
                  <th>Servicio</th>
                  <th>Promotor</th>
                  <th>Costo</th>
                  <th>Comisión</th>
                  <th>Estado</th>
                  <th className="no-print">Fecha pago</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="col-id">{f.id}</td>
                    <td className="col-fecha">{f.fecha}</td>
                    <td>{f.operador_nombre ?? "—"}</td>
                    <td>{f.servicio ?? "—"}</td>
                    <td>{f.promotor ?? "—"}</td>
                    <td className="col-money">{fmt(f.costo)}</td>
                    <td className="col-money col-money--green">{fmt(f.costo_promotor)}</td>
                    <td>
                      <span className={`badge ${f.comision_pagada ? "badge--green" : "badge--yellow"}`}>
                        {f.comision_pagada ? "Pagada" : "Pendiente"}
                      </span>
                    </td>
                    <td className="col-fecha no-print">{f.fecha_pago ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={5}><strong>TOTAL ({filas.length} registros)</strong></td>
                  <td className="col-money"><strong>{fmt(totalCosto)}</strong></td>
                  <td className="col-money col-money--green"><strong>{fmt(totalComision)}</strong></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Botones de acción (se ocultan al imprimir) ── */}
          <div className="no-print" style={{ display: "flex", gap: "10px", marginTop: "16px", alignItems: "center" }}>
            {pendientes.length > 0 && (
              <button
                type="button"
                className="btn-primary"
                onClick={handlePagar}
                disabled={pagarMutation.isPending}
              >
                {pagarMutation.isPending
                  ? "Procesando..."
                  : `Pagar ${pendientes.length} comisión${pendientes.length !== 1 ? "es" : ""} · ${fmt(totalPendiente)}`}
              </button>
            )}
            {pagado && (
              <span style={{ color: "var(--success)", fontWeight: 600 }}>
                ✓ Comisiones marcadas como pagadas
              </span>
            )}
            <button
              type="button"
              className="ghost-btn"
              onClick={() => window.print()}
              style={{ marginLeft: "auto" }}
            >
              🖨️ Imprimir
            </button>
          </div>

          {pagarMutation.isError && (
            <div className="alert-error no-print" style={{ marginTop: "8px" }}>
              Error: {(pagarMutation.error as Error).message}
            </div>
          )}
        </>
      )}
    </div>
  );
}
