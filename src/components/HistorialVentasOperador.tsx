import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

/** Clave de React Query para invalidar tras guardar ventas. */
export const VENTAS_POR_OPERADOR_QUERY_KEY = "ventas_por_operador" as const;

export type VentaHistorialOperadorRow = {
  id: number;
  fecha: string;
  ticket_id: number | null;
  servicio: string | null;
  costo: number;
  cobro: number;
  faltante: number;
  forma_pago: string;
  cancelado: boolean;
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

async function fetchVentasHistorialOperador(
  operadorId: number,
): Promise<VentaHistorialOperadorRow[]> {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      "id, fecha, ticket_id, servicio, costo, cobro, faltante, forma_pago, cancelado",
    )
    .eq("operador_id", operadorId)
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as VentaHistorialOperadorRow[];
}

type Props = {
  operadorId: number;
  /** Estilo más compacto (p. ej. columna izquierda en nueva venta). */
  compact?: boolean;
};

export default function HistorialVentasOperador({ operadorId, compact }: Props) {
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: [VENTAS_POR_OPERADOR_QUERY_KEY, operadorId],
    queryFn: () => fetchVentasHistorialOperador(operadorId),
    enabled: operadorId > 0,
  });

  return (
    <div
      id="historial-ventas-operador"
      className={`historial-ventas-op${compact ? " historial-ventas-op--compact" : ""}`}
    >
      <div className="form-group-title" style={{ marginBottom: "8px" }}>
        Historial de ventas
      </div>
      <p className="historial-ventas-op__hint">
        Servicios ya cobrados a este operador. Evita duplicar líneas si no aplica.
      </p>

      {isLoading && (
        <p className="field-hint" style={{ marginTop: "8px" }}>
          Cargando historial…
        </p>
      )}
      {isError && (
        <p className="field-hint" style={{ color: "#b91c1c", marginTop: "8px" }}>
          {(error as Error).message}
        </p>
      )}
      {!isLoading && !isError && data.length === 0 && (
        <p className="field-hint" style={{ marginTop: "8px" }}>
          Sin ventas registradas con este operador.
        </p>
      )}
      {!isLoading && !isError && data.length > 0 && (
        <div className="historial-ventas-op__scroll">
          <table className="historial-ventas-op__table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Servicio</th>
                <th className="col-monto">Costo</th>
                <th className="col-monto">Cobro</th>
                <th className="col-monto">Faltante</th>
                <th>Pago</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr
                  key={v.id}
                  className={v.cancelado ? "historial-ventas-op__fila-cancelada" : undefined}
                >
                  <td className="col-fecha">{v.fecha}</td>
                  <td>
                    {v.servicio ?? "—"}
                    {v.ticket_id != null && (
                      <span className="historial-ventas-op__ticket-hint">
                        {" "}
                        · T#{v.ticket_id}
                      </span>
                    )}
                  </td>
                  <td className="col-monto">{fmt(Number(v.costo))}</td>
                  <td className="col-monto">{fmt(Number(v.cobro))}</td>
                  <td className="col-monto">{fmt(Number(v.faltante))}</td>
                  <td>
                    <span className="historial-ventas-op__forma">
                      {v.forma_pago === "Saldo" ? "Saldo a favor" : v.forma_pago}
                    </span>
                    {v.cancelado && (
                      <span className="badge badge--cancelado historial-ventas-op__badge-cancel">
                        Cancelada
                      </span>
                    )}
                  </td>
                  <td>
                    <Link href={`/ventas/${v.id}`}>
                      <button type="button" className="btn-edit btn-edit--small">
                        Ver
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
