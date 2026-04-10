import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { VentaPago } from "../lib/types";

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

type EmbeddedVenta = {
  id: number;
  operador_nombre: string | null;
  servicio: string | null;
  fecha: string;
};

type PagoComprobRow = VentaPago & {
  venta_directa: EmbeddedVenta | null;
  ticket: { id: number; ventas: EmbeddedVenta[] | null } | null;
};

function montoDigital(p: VentaPago): number {
  if (p.forma_pago === "Deposito") return Number(p.monto ?? 0);
  if (p.forma_pago === "Dividida") return Number(p.pago_deposito ?? 0);
  return 0;
}

function linkVentaId(p: PagoComprobRow): number | null {
  if (p.venta_id != null) return p.venta_id;
  const list = p.ticket?.ventas;
  if (list?.length) {
    return [...list].sort((a, b) => a.id - b.id)[0]!.id;
  }
  return null;
}

function etiquetaContexto(p: PagoComprobRow): string {
  const v = p.venta_directa ?? p.ticket?.ventas?.[0];
  if (!v) return p.ticket_id != null ? `Ticket #${p.ticket_id}` : "—";
  const suf = p.ticket_id != null && !p.venta_id ? " · ticket" : "";
  return `${v.operador_nombre ?? "—"} · ${v.servicio ?? "—"}${suf}`;
}

async function fetchPagosDigitales(
  fecha: string,
  soloPendientes: boolean,
): Promise<PagoComprobRow[]> {
  let q = supabase
    .from("ventas_pagos")
    .select(
      `
      *,
      venta_directa:ventas!venta_id ( id, operador_nombre, servicio, fecha ),
      ticket:tickets!ticket_id (
        id,
        ventas ( id, operador_nombre, servicio, fecha )
      )
    `,
    )
    .eq("cancelado", false)
    .eq("fecha", fecha)
    .or("forma_pago.eq.Deposito,and(forma_pago.eq.Dividida,pago_deposito.gt.0)")
    .order("created_at", { ascending: false });

  if (soloPendientes) {
    q = q.eq("comprobado", false);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PagoComprobRow[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtFechaHora(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function ComprobacionTransferencias() {
  const queryClient = useQueryClient();
  const [fechaFiltro, setFechaFiltro] = useState<string>(hoy());
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  const queryKey = ["comprobacion_transferencias", fechaFiltro, soloPendientes] as const;

  const {
    data: pagos = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchPagosDigitales(fechaFiltro, soloPendientes),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, comprobado }: { id: number; comprobado: boolean }) => {
      const { error: upErr } = await supabase
        .from("ventas_pagos")
        .update({
          comprobado,
          comprobado_at: comprobado ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (upErr) throw new Error(upErr.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comprobacion_transferencias"] });
    },
  });

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return pagos;
    return pagos.filter((p) => {
      const ref = (p.referencia ?? "").toLowerCase();
      const conc = (p.concepto ?? "").toLowerCase();
      const ctx = etiquetaContexto(p).toLowerCase();
      return ref.includes(t) || conc.includes(t) || ctx.includes(t) || String(p.id).includes(t);
    });
  }, [pagos, busqueda]);

  const pendientesCount = useMemo(
    () => pagos.filter((p) => !p.comprobado).length,
    [pagos],
  );

  const esHoy = fechaFiltro === hoy();

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">🏦</span> Comprobación de transferencias
          </h1>
          <p className="page-subtitle">
            Pagos con depósito o transferencia (incluye la parte digital en pagos divididos).
            {soloPendientes
              ? esHoy
                ? " Solo pendientes de comprobar — hoy."
                : ` Solo pendientes — ${fechaFiltro}.`
              : esHoy
                ? " Todos los movimientos digitales de hoy."
                : ` Todos los movimientos digitales del ${fechaFiltro}.`}
          </p>
        </div>
      </div>

      <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <input
          className="search-input"
          type="text"
          placeholder="Buscar por referencia, concepto, operador…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <input
          type="date"
          className="search-input"
          style={{ maxWidth: "160px" }}
          value={fechaFiltro}
          onChange={(e) => setFechaFiltro(e.target.value || hoy())}
        />
        {!esHoy && (
          <button
            type="button"
            className="btn-secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setFechaFiltro(hoy())}
          >
            Hoy
          </button>
        )}
        <button
          type="button"
          className={`btn-secondary ${soloPendientes ? "btn-secondary--active" : ""}`}
          style={{ whiteSpace: "nowrap" }}
          onClick={() => setSoloPendientes((v) => !v)}
        >
          {soloPendientes ? "Solo pendientes" : "Ver todos (fecha)"}
        </button>
        <span className="record-count">
          {isLoading
            ? "Cargando…"
            : `${filtrados.length} movimiento${filtrados.length !== 1 ? "s" : ""}`}
          {!soloPendientes && !isLoading && pendientesCount > 0 && (
            <span style={{ marginLeft: "0.35rem", opacity: 0.85 }}>
              ({pendientesCount} pendiente{pendientesCount !== 1 ? "s" : ""})
            </span>
          )}
        </span>
      </div>

      {isError && (
        <div className="alert-error">
          Error al cargar pagos: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Contexto</th>
                <th>Forma</th>
                <th>Monto digital</th>
                <th>Referencia</th>
                <th>Concepto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty">
                    {busqueda
                      ? "No hay resultados para la búsqueda."
                      : soloPendientes
                        ? "No hay transferencias pendientes de comprobar para esta fecha."
                        : "No hay movimientos digitales para esta fecha."}
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => {
                  const md = montoDigital(p);
                  const vid = linkVentaId(p);
                  return (
                    <tr key={p.id} className={p.comprobado ? "" : "fila-pendiente-comprobacion"}>
                      <td className="col-id">{p.id}</td>
                      <td className="col-fecha">{p.fecha}</td>
                      <td>{etiquetaContexto(p)}</td>
                      <td>
                        <span
                          className={`badge ${
                            p.forma_pago === "Dividida" ? "badge--amber" : "badge--blue"
                          }`}
                        >
                          {p.forma_pago === "Dividida" ? "Dividida (dep.)" : p.forma_pago}
                        </span>
                      </td>
                      <td className="col-money col-money--green">{fmt(md)}</td>
                      <td>{p.referencia ?? "—"}</td>
                      <td>{p.concepto ?? "—"}</td>
                      <td>
                        {p.comprobado ? (
                          <span className="badge badge--green" title={fmtFechaHora(p.comprobado_at)}>
                            Comprobado
                          </span>
                        ) : (
                          <span className="badge badge--yellow">Pendiente</span>
                        )}
                      </td>
                      <td className="col-actions">
                        {vid != null && (
                          <Link href={`/ventas/${vid}`}>
                            <button type="button" className="btn-edit">
                              Venta
                            </button>
                          </Link>
                        )}
                        <button
                          type="button"
                          className={p.comprobado ? "btn-secondary" : "btn-primary"}
                          disabled={toggleMutation.isPending}
                          onClick={() =>
                            toggleMutation.mutate({ id: p.id, comprobado: !p.comprobado })
                          }
                        >
                          {p.comprobado ? "Desmarcar" : "Comprobar"}
                        </button>
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
          <span>Cargando movimientos…</span>
        </div>
      )}
    </div>
  );
}
