import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OperadorTraslado {
  numero_consecutivo: number;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  curp: string | null;
  telefono_1: string | null;
  fecha_traslado: string | null;
  hora_encuentro: string | null;
  punto_reunion: string | null;
  estatus_progreso_traslado: boolean;
  estatus_concluido_traslado: boolean;
  observaciones_traslado: string | null;
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchTraslados(fecha: string): Promise<OperadorTraslado[]> {
  const { data, error } = await supabase
    .from("operadores")
    .select(
      "numero_consecutivo, nombre, apellido_paterno, apellido_materno, curp, telefono_1, fecha_traslado, hora_encuentro, punto_reunion, estatus_progreso_traslado, estatus_concluido_traslado, observaciones_traslado",
    )
    .eq("fecha_traslado", fecha)
    .order("hora_encuentro", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OperadorTraslado[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function nombreCompleto(op: OperadorTraslado) {
  return [op.nombre, op.apellido_paterno, op.apellido_materno]
    .filter(Boolean)
    .join(" ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Traslados() {
  const [fecha, setFecha] = useState(hoy());
  const [fechaBuscar, setFechaBuscar] = useState(hoy());
  const queryClient = useQueryClient();

  const { data: operadores = [], isLoading, isError, error } = useQuery({
    queryKey: ["traslados", fechaBuscar],
    queryFn: () => fetchTraslados(fechaBuscar),
  });

  const mutation = useMutation({
    mutationFn: async ({
      id,
      campo,
      valor,
    }: {
      id: number;
      campo: "estatus_progreso_traslado" | "estatus_concluido_traslado";
      valor: boolean;
    }) => {
      const { error } = await supabase
        .from("operadores")
        .update({ [campo]: valor })
        .eq("numero_consecutivo", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traslados", fechaBuscar] });
    },
  });

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setFechaBuscar(fecha);
  }

  // Agrupar por punto de reunión
  const grupos = operadores.reduce<Record<string, OperadorTraslado[]>>(
    (acc, op) => {
      const key = op.punto_reunion ?? "Sin punto definido";
      if (!acc[key]) acc[key] = [];
      acc[key].push(op);
      return acc;
    },
    {},
  );

  const concluidos = operadores.filter((o) => o.estatus_concluido_traslado).length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">🚌</span> Traslados
          </h1>
          <p className="page-subtitle">
            Operadores programados para traslado por fecha. Agrupados por punto
            de reunión.
          </p>
        </div>
      </div>

      {/* Selector de fecha */}
      <form onSubmit={handleBuscar} className="filter-card">
        <div className="filter-grid" style={{ gridTemplateColumns: "auto auto auto" }}>
          <div className="form-field">
            <label>Fecha de traslado</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>
          <div className="form-field form-field-center">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Cargando…" : "Ver traslados"}
            </button>
          </div>
          {operadores.length > 0 && (
            <div className="traslado-stats">
              <span className="badge badge--blue">{operadores.length} operadores</span>
              <span className="badge badge--green">{concluidos} concluidos</span>
              <span className="badge badge--yellow">
                {operadores.length - concluidos} pendientes
              </span>
            </div>
          )}
        </div>
      </form>

      {isError && (
        <div className="alert-error">Error: {(error as Error).message}</div>
      )}

      {isLoading && (
        <div className="loading-state" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Cargando traslados...</span>
        </div>
      )}

      {!isLoading && !isError && operadores.length === 0 && (
        <div className="empty-report">
          <span>Sin traslados</span>
          <p>No hay operadores programados para esta fecha.</p>
        </div>
      )}

      {/* Grupos por punto de reunión */}
      {Object.entries(grupos).map(([punto, ops]) => (
        <div key={punto} className="traslado-grupo">
          <div className="traslado-grupo-header">
            <span className="traslado-punto">📍 {punto}</span>
            <span className="traslado-hora">
              {ops[0]?.hora_encuentro
                ? `Hora: ${ops[0].hora_encuentro.slice(0, 5)}`
                : ""}
            </span>
            <span className="badge badge--blue">{ops.length} operador{ops.length !== 1 ? "es" : ""}</span>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre completo</th>
                  <th>CURP</th>
                  <th>Teléfono</th>
                  <th>Observaciones</th>
                  <th>Progreso</th>
                  <th>Concluido</th>
                  <th>Ver</th>
                </tr>
              </thead>
              <tbody>
                {ops.map((op) => (
                  <tr
                    key={op.numero_consecutivo}
                    className={
                      op.estatus_concluido_traslado ? "row-concluido" : ""
                    }
                  >
                    <td className="col-id">{op.numero_consecutivo}</td>
                    <td className="col-nombre">{nombreCompleto(op)}</td>
                    <td className="col-curp">{op.curp ?? "—"}</td>
                    <td>{op.telefono_1 ?? "—"}</td>
                    <td className="col-obs">
                      {op.observaciones_traslado ?? "—"}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!op.estatus_progreso_traslado}
                        onChange={(e) =>
                          mutation.mutate({
                            id: op.numero_consecutivo,
                            campo: "estatus_progreso_traslado",
                            valor: e.target.checked,
                          })
                        }
                        style={{ accentColor: "#f59e0b", width: 16, height: 16 }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!op.estatus_concluido_traslado}
                        onChange={(e) =>
                          mutation.mutate({
                            id: op.numero_consecutivo,
                            campo: "estatus_concluido_traslado",
                            valor: e.target.checked,
                          })
                        }
                        style={{ accentColor: "#16a34a", width: 16, height: 16 }}
                      />
                    </td>
                    <td>
                      <Link href={`/operadores/${op.numero_consecutivo}`}>
                        <button className="btn-edit">Ver</button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
