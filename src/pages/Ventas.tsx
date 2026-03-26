import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Venta } from "../lib/types";

async function fetchVentas(): Promise<Venta[]> {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      "id, fecha, curp_operador, servicio, costo, cobro, faltante, forma_pago, promotor, comision_pagada",
    )
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);

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
  const [busqueda, setBusqueda] = useState("");

  const {
    data: ventas = [],
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["ventas"], queryFn: fetchVentas });

  const filtradas = ventas.filter((v) => {
    const txt = busqueda.toLowerCase();
    return (
      (v.curp_operador ?? "").toLowerCase().includes(txt) ||
      (v.servicio ?? "").toLowerCase().includes(txt) ||
      (v.promotor ?? "").toLowerCase().includes(txt)
    );
  });

  const totalCobrado = filtradas.reduce((s, v) => s + (v.cobro ?? 0), 0);
  const totalFaltante = filtradas.reduce((s, v) => s + (v.faltante ?? 0), 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">💰</span> Ventas
          </h1>
          <p className="page-subtitle">
            Registro de ventas vinculadas a un operador. Servicio, costo, cobro
            y forma de pago.
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
          placeholder="Buscar por CURP, servicio o promotor..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
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
            <span className="summary-label">Registros mostrados</span>
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
                <th>Operador (CURP)</th>
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
                      : "No hay ventas registradas. Crea la primera."}
                  </td>
                </tr>
              ) : (
                filtradas.map((v) => (
                  <tr key={v.id}>
                    <td className="col-id">{v.id}</td>
                    <td className="col-fecha">{v.fecha}</td>
                    <td className="col-curp">{v.curp_operador ?? "—"}</td>
                    <td>{v.servicio ?? "—"}</td>
                    <td className="col-money">{fmt(v.costo)}</td>
                    <td className="col-money col-money--green">{fmt(v.cobro)}</td>
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
                    <td>{v.promotor ?? "—"}</td>
                    <td>
                      <span
                        className={`badge ${v.comision_pagada ? "badge--green" : "badge--yellow"}`}
                      >
                        {v.comision_pagada ? "Pagada" : "Pend."}
                      </span>
                    </td>
                    <td>
                      <Link href={`/ventas/${v.id}`}>
                        <button className="btn-edit">Editar</button>
                      </Link>
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
