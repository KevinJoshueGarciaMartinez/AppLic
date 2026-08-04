import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { normalizeForSearch } from "../lib/inputNormalization";
import {
  anularReembolso,
  procesarReembolso,
  resolverReembolso,
} from "../lib/reembolsos";
import type { EstadoReembolso, Reembolso } from "../lib/types";

type VentaContexto = {
  id: number;
  operador_nombre: string | null;
  servicio: string | null;
};

type ReembolsoListado = Reembolso & {
  venta_directa: VentaContexto | null;
  ticket: { id: number; ventas: VentaContexto[] | null } | null;
};

type Props = {
  role: "admin" | "recepcion" | "ventas";
};

const ESTADOS: Array<{ value: "todos" | EstadoReembolso; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "solicitado", label: "Solicitados" },
  { value: "autorizado", label: "Autorizados" },
  { value: "procesado", label: "Procesados" },
  { value: "rechazado", label: "Rechazados" },
  { value: "anulado", label: "Anulados" },
];

async function fetchBandejaReembolsos(): Promise<ReembolsoListado[]> {
  const { data, error } = await supabase
    .from("reembolsos")
    .select(`
      id, venta_id, ticket_id, operador_id, tipo, estado, monto, forma_reembolso,
      reembolso_efectivo, reembolso_deposito, reembolso_saldo,
      motivo, referencia, observaciones, solicitado_por, solicitado_at, autorizado_at, procesado_at,
      venta_directa:ventas!venta_id ( id, operador_nombre, servicio ),
      ticket:tickets!ticket_id (
        id,
        ventas ( id, operador_nombre, servicio )
      )
    `)
    .order("solicitado_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as unknown as ReembolsoListado),
    monto: Number(row.monto ?? 0),
    reembolso_efectivo: Number(row.reembolso_efectivo ?? 0),
    reembolso_deposito: Number(row.reembolso_deposito ?? 0),
    reembolso_saldo: Number(row.reembolso_saldo ?? 0),
  }));
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

function contexto(reembolso: ReembolsoListado): VentaContexto | null {
  if (reembolso.venta_directa) return reembolso.venta_directa;
  const ventas = reembolso.ticket?.ventas;
  if (!ventas?.length) return null;
  return [...ventas].sort((a, b) => a.id - b.id)[0] ?? null;
}

function ventaLinkId(reembolso: ReembolsoListado): number | null {
  return contexto(reembolso)?.id ?? reembolso.venta_id;
}

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function Reembolsos({ role }: Props) {
  const queryClient = useQueryClient();
  const esAdmin = role === "admin";
  const [estado, setEstado] = useState<"todos" | EstadoReembolso>(
    esAdmin ? "solicitado" : "autorizado",
  );
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");

  const { data: currentUserId = null } = useQuery({
    queryKey: ["auth_user_id"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    staleTime: Infinity,
  });

  const queryKey = ["bandeja_reembolsos"] as const;
  const { data: reembolsos = [], isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: fetchBandejaReembolsos,
  });

  const resolverMutation = useMutation({
    mutationFn: ({
      id,
      autorizar,
      observaciones,
    }: {
      id: number;
      autorizar: boolean;
      observaciones: string | null;
    }) => resolverReembolso(id, autorizar, observaciones),
    onSuccess: async (_, variables) => {
      setMensaje(variables.autorizar ? "REEMBOLSO AUTORIZADO." : "REEMBOLSO RECHAZADO.");
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
      await queryClient.invalidateQueries({ queryKey: ["reembolso_resumen"] });
    },
  });

  const procesarMutation = useMutation({
    mutationFn: ({ id, referencia }: { id: number; referencia: string | null }) =>
      procesarReembolso(id, referencia),
    onSuccess: async () => {
      setMensaje("REEMBOLSO PROCESADO.");
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
      await queryClient.invalidateQueries({ queryKey: ["reembolso_resumen"] });
      await queryClient.invalidateQueries({ queryKey: ["operador_saldos"] });
      await queryClient.invalidateQueries({ queryKey: ["operador_saldo_movs"] });
    },
  });

  const anularMutation = useMutation({
    mutationFn: (id: number) => anularReembolso(id),
    onSuccess: async () => {
      setMensaje("SOLICITUD ANULADA.");
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
      await queryClient.invalidateQueries({ queryKey: ["reembolso_resumen"] });
    },
  });

  const filtrados = useMemo(() => {
    const text = normalizeForSearch(busqueda);
    return reembolsos.filter((reembolso) => {
      if (estado !== "todos" && reembolso.estado !== estado) return false;
      if (!text) return true;
      const ctx = contexto(reembolso);
      return [
        String(reembolso.id),
        reembolso.motivo,
        reembolso.referencia,
        ctx?.operador_nombre,
        ctx?.servicio,
      ].some((value) => normalizeForSearch(value).includes(text));
    });
  }, [reembolsos, estado, busqueda]);

  const totalFiltrado = filtrados.reduce((sum, reembolso) => sum + reembolso.monto, 0);
  const pendienteAutorizar = reembolsos.filter((r) => r.estado === "solicitado").length;
  const pendienteProcesar = reembolsos.filter((r) => r.estado === "autorizado").length;
  const mutationError = resolverMutation.error ?? procesarMutation.error ?? anularMutation.error;
  const mutando = resolverMutation.isPending || procesarMutation.isPending || anularMutation.isPending;

  function autorizar(reembolso: ReembolsoListado) {
    if (!window.confirm(
      `AUTORIZAR EL REEMBOLSO #${reembolso.id} POR ${fmt(reembolso.monto)}?`,
    )) return;
    setMensaje("");
    resolverMutation.mutate({ id: reembolso.id, autorizar: true, observaciones: null });
  }

  function rechazar(reembolso: ReembolsoListado) {
    const motivo = window.prompt("INDICA EL MOTIVO DEL RECHAZO:");
    if (motivo == null) return;
    if (motivo.trim().length < 5) {
      setMensaje("EL MOTIVO DEL RECHAZO DEBE TENER AL MENOS 5 CARACTERES.");
      return;
    }
    resolverMutation.mutate({ id: reembolso.id, autorizar: false, observaciones: motivo.trim() });
  }

  function procesar(reembolso: ReembolsoListado) {
    let referencia: string | null = null;
    if (reembolso.reembolso_deposito > 0) {
      referencia = window.prompt("CAPTURA LA REFERENCIA DE LA DEVOLUCION BANCARIA:")?.trim() ?? null;
      if (!referencia || referencia.length < 3) {
        setMensaje("LA REFERENCIA BANCARIA ES OBLIGATORIA.");
        return;
      }
    }
    if (!window.confirm(
      `CONFIRMAS QUE YA SE ENTREGO ${fmt(reembolso.monto)} AL CLIENTE? ESTA ACCION REGISTRA LA SALIDA DE DINERO.`,
    )) return;
    setMensaje("");
    procesarMutation.mutate({ id: reembolso.id, referencia });
  }

  function anular(reembolso: ReembolsoListado) {
    if (!window.confirm(`ANULAR LA SOLICITUD #${reembolso.id}?`)) return;
    setMensaje("");
    anularMutation.mutate(reembolso.id);
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon" aria-hidden="true">↩</span> Reembolsos
          </h1>
          <p className="page-subtitle">
            {esAdmin
              ? "Autoriza, rechaza y procesa devoluciones solicitadas."
              : "Consulta y procesa devoluciones previamente autorizadas."}
          </p>
        </div>
      </div>

      <div className="summary-bar reembolsos-summary">
        <div className="summary-item">
          <span className="summary-label">Por autorizar</span>
          <span className="summary-value">{pendienteAutorizar}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Por procesar</span>
          <span className="summary-value">{pendienteProcesar}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Total filtrado</span>
          <span className="summary-value">{fmt(totalFiltrado)}</span>
        </div>
      </div>

      <div className="toolbar reembolsos-toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Buscar por folio, operador, servicio, motivo o referencia..."
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <select
          className="search-input"
          value={estado}
          onChange={(event) => setEstado(event.target.value as "todos" | EstadoReembolso)}
        >
          {ESTADOS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span className="record-count">
          {isLoading ? "Cargando..." : `${filtrados.length} reembolso${filtrados.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {mensaje && (
        <div className={mutationError ? "alert-error" : "alert-success"}>{mensaje}</div>
      )}
      {mutationError && (
        <div className="alert-error">{(mutationError as Error).message}</div>
      )}
      {isError && (
        <div className="alert-error">Error al cargar reembolsos: {(error as Error).message}</div>
      )}

      {!isLoading && !isError && (
        <div className="table-wrapper">
          <table className="data-table reembolsos-admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Solicitud</th>
                <th>Ticket / cliente</th>
                <th>Motivo</th>
                <th>Forma</th>
                <th>Estado</th>
                <th className="col-money">Monto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={8} className="table-empty">No hay reembolsos para mostrar.</td></tr>
              ) : filtrados.map((reembolso) => {
                const ctx = contexto(reembolso);
                const linkId = ventaLinkId(reembolso);
                return (
                  <tr key={reembolso.id}>
                    <td className="col-id">{reembolso.id}</td>
                    <td>{fmtFecha(reembolso.solicitado_at)}</td>
                    <td>
                      <strong>{reembolso.ticket_id != null ? `TICKET #${reembolso.ticket_id}` : `VENTA #${reembolso.venta_id}`}</strong>
                      <div className="reembolso-contexto">{ctx?.operador_nombre ?? "—"}</div>
                      <div className="reembolso-contexto">{ctx?.servicio ?? "—"}</div>
                    </td>
                    <td title={reembolso.observaciones ?? ""}>{reembolso.motivo}</td>
                    <td>
                      <span className="badge badge--blue">{reembolso.forma_reembolso}</span>
                      {reembolso.referencia && <div className="reembolso-contexto">REF. {reembolso.referencia}</div>}
                    </td>
                    <td>
                      <span className={`badge reembolso-estado reembolso-estado--${reembolso.estado}`}>
                        {reembolso.estado}
                      </span>
                    </td>
                    <td className="col-money">{fmt(reembolso.monto)}</td>
                    <td className="col-actions reembolso-acciones">
                      {linkId != null && (
                        <Link href={`/ventas/${linkId}`}><button type="button" className="btn-edit">Venta</button></Link>
                      )}
                      {esAdmin && reembolso.estado === "solicitado" && (
                        <>
                          <button type="button" className="btn-primary" disabled={mutando} onClick={() => autorizar(reembolso)}>Autorizar</button>
                          <button type="button" className="btn-danger" disabled={mutando} onClick={() => rechazar(reembolso)}>Rechazar</button>
                        </>
                      )}
                      {reembolso.estado === "autorizado" && (
                        <button type="button" className="btn-primary" disabled={mutando} onClick={() => procesar(reembolso)}>Procesar</button>
                      )}
                      {(esAdmin || reembolso.solicitado_por === currentUserId)
                        && (reembolso.estado === "solicitado" || reembolso.estado === "autorizado") && (
                        <button type="button" className="btn-secondary" disabled={mutando} onClick={() => anular(reembolso)}>Anular</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && (
        <div className="loading-state"><div className="spinner" /><span>Cargando reembolsos...</span></div>
      )}
    </div>
  );
}
