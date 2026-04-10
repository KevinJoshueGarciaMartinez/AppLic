import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Venta } from "../lib/types";

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchVentas(fecha: string | null, verCanceladas: boolean): Promise<Venta[]> {
  let q = supabase
    .from("ventas")
    .select(
      "id, fecha, operador_id, operador_nombre, servicio, costo, cobro, faltante, forma_pago, promotor, comision_pagada, cancelado, motivo_cancelacion",
    )
    .order("fecha", { ascending: false })
    .order("id", { ascending: false });

  if (fecha) {
    q = q.eq("fecha", fecha);
  } else {
    q = q.limit(500);
  }

  if (!verCanceladas) {
    q = q.eq("cancelado", false);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Venta[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function Ventas() {
  const [, navigate] = useLocation();
  const [busqueda, setBusqueda] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState<string | null>(hoy());
  const [verCanceladas, setVerCanceladas] = useState(false);

  const {
    data: ventas = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["ventas", fechaFiltro, verCanceladas],
    queryFn: () => fetchVentas(fechaFiltro, verCanceladas),
  });

  const filtradas = ventas.filter((v) => {
    const txt = busqueda.toLowerCase();
    return (
      (v.operador_nombre ?? "").toLowerCase().includes(txt) ||
      (v.servicio ?? "").toLowerCase().includes(txt) ||
      (v.promotor ?? "").toLowerCase().includes(txt)
    );
  });

  const totalCobrado = filtradas.reduce((s, v) => s + (v.cobro ?? 0), 0);
  const totalFaltante = filtradas.reduce((s, v) => s + (v.faltante ?? 0), 0);
  const totalCosto = filtradas.reduce((s, v) => s + (v.costo ?? 0), 0);

  const esHoy = fechaFiltro === hoy();

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">💰</span> Ventas
          </h1>
          <p className="page-subtitle">
            {fechaFiltro
              ? esHoy
                ? "Ventas del día de hoy"
                : `Ventas del ${fechaFiltro}`
              : "Todas las ventas (últimas 500)"}
          </p>
        </div>
        <Link href="/ventas/nuevo">
          <button className="btn-primary">+ Nueva Venta</button>
        </Link>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Buscar por operador, servicio o promotor..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <input
          type="date"
          className="search-input"
          style={{ maxWidth: "160px" }}
          value={fechaFiltro ?? ""}
          onChange={(e) => setFechaFiltro(e.target.value || null)}
        />
        {fechaFiltro !== hoy() && (
          <button
            className="btn-secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setFechaFiltro(hoy())}
          >
            Hoy
          </button>
        )}
        {fechaFiltro !== null && (
          <button
            className="btn-secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setFechaFiltro(null)}
          >
            Ver todas
          </button>
        )}
        <button
          className={`btn-secondary ${verCanceladas ? "btn-secondary--active" : ""}`}
          style={{ whiteSpace: "nowrap" }}
          onClick={() => setVerCanceladas((v) => !v)}
        >
          {verCanceladas ? "Ocultar canceladas" : "Ver canceladas"}
        </button>
        <span className="record-count">
          {isLoading
            ? "Cargando..."
            : `${filtradas.length} registro${filtradas.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Totales rápidos */}
      {!isLoading && filtradas.length > 0 && (
        <div className="summary-bar">
          <div className="summary-item">
            <span className="summary-label">Total costo</span>
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
            <span className="summary-label">Registros</span>
            <span className="summary-value">{filtradas.length}</span>
          </div>
        </div>
      )}

      {isError && (
        <div className="alert-error">
          Error al cargar ventas: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Operador</th>
                <th>Servicio</th>
                <th>Costo</th>
                <th>Cobro</th>
                <th>Faltante</th>
                <th>Forma pago</th>
                <th>Promotor</th>
                <th>Com.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={11} className="table-empty">
                    {busqueda
                      ? "No hay resultados para la búsqueda."
                      : fechaFiltro
                        ? "No hay ventas registradas para esta fecha."
                        : "No hay ventas registradas. Crea la primera."}
                  </td>
                </tr>
              ) : (
                filtradas.map((v) => (
                  <tr key={v.id} className={v.cancelado ? "fila-cancelada" : ""}>
                    <td className="col-id">{v.id}</td>
                    <td className="col-fecha">{v.fecha}</td>
                    <td>{v.operador_nombre ?? "—"}</td>
                    <td>{v.servicio ?? "—"}</td>
                    <td className="col-money">{fmt(v.costo)}</td>
                    <td className="col-money col-money--green">{fmt(v.cobro)}</td>
                    <td
                      className={`col-money ${(v.faltante ?? 0) > 0 ? "col-money--red" : "col-money--green"}`}
                    >
                      {fmt(v.faltante ?? 0)}
                    </td>
                    <td>
                      {v.cancelado ? (
                        <span className="badge badge--cancelado" title={v.motivo_cancelacion ?? ""}>
                          ⛔ Cancelada
                        </span>
                      ) : (
                        <span
                          className={`badge ${
                            v.forma_pago === "Efectivo"
                              ? "badge--gray"
                              : v.forma_pago === "Dividida"
                                ? "badge--amber"
                                : "badge--blue"
                          }`}
                        >
                          {v.forma_pago}
                        </span>
                      )}
                    </td>
                    <td>{v.promotor ?? "—"}</td>
                    <td>
                      <span
                        className={`badge ${v.comision_pagada ? "badge--green" : "badge--yellow"}`}
                      >
                        {v.comision_pagada ? "Pagada" : "Pend."}
                      </span>
                    </td>
                    <td className="col-actions">
                      <Link href={`/ventas/${v.id}`}>
                        <button className="btn-edit">Editar</button>
                      </Link>
                      {(v.faltante ?? 0) > 0.005 && (
                        <button
                          className="btn-liquidar"
                          title="Registrar pago de liquidación"
                          onClick={() => navigate(`/ventas/${v.id}`)}
                        >
                          💳 Liquidar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Cargando ventas...</span>
        </div>
      )}
    </div>
  );
}
