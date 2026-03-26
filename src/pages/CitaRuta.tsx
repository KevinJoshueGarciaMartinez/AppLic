import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OperadorCita {
  numero_consecutivo: number;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  curp: string;
  telefono_1: string | null;
  cita_fecha_solicitada: string | null;
  cita_fecha_asignada: string | null;
  hoja_ayuda_pago_ventanilla: boolean;
  contrasena_lfd: string | null;
  estatus_progreso_cita: boolean;
  estatus_concluido_cita: boolean;
  fecha_traslado: string | null;
  punto_reunion: string | null;
  hora_encuentro: string | null;
  estatus_progreso_traslado: boolean;
  estatus_concluido_traslado: boolean;
}

type FiltroEstatus = "todos" | "pendiente" | "progreso" | "concluido";

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchCitas(
  desde: string,
  hasta: string,
  estatus: FiltroEstatus,
): Promise<OperadorCita[]> {
  let q = supabase
    .from("operadores")
    .select(
      "numero_consecutivo, nombre, apellido_paterno, apellido_materno, curp, telefono_1, cita_fecha_solicitada, cita_fecha_asignada, hoja_ayuda_pago_ventanilla, contrasena_lfd, estatus_progreso_cita, estatus_concluido_cita, fecha_traslado, punto_reunion, hora_encuentro, estatus_progreso_traslado, estatus_concluido_traslado",
    )
    .not("cita_fecha_solicitada", "is", null)
    .order("cita_fecha_asignada", { ascending: true, nullsFirst: false });

  if (desde) q = q.gte("cita_fecha_solicitada", desde);
  if (hasta) q = q.lte("cita_fecha_solicitada", hasta);

  if (estatus === "pendiente") {
    q = q.eq("estatus_progreso_cita", false).eq("estatus_concluido_cita", false);
  } else if (estatus === "progreso") {
    q = q.eq("estatus_progreso_cita", true).eq("estatus_concluido_cita", false);
  } else if (estatus === "concluido") {
    q = q.eq("estatus_concluido_cita", true);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OperadorCita[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function hace30() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function nombreCompleto(op: OperadorCita) {
  return [op.nombre, op.apellido_paterno, op.apellido_materno]
    .filter(Boolean)
    .join(" ");
}

function getEstatus(op: OperadorCita) {
  if (op.estatus_concluido_cita) return { label: "Concluido", cls: "badge--green" };
  if (op.estatus_progreso_cita) return { label: "En progreso", cls: "badge--blue" };
  return { label: "Pendiente", cls: "badge--yellow" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CitaRuta() {
  const [desde, setDesde] = useState(hace30());
  const [hasta, setHasta] = useState(hoy());
  const [estatus, setEstatus] = useState<FiltroEstatus>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [buscar, setBuscar] = useState(true);
  const queryClient = useQueryClient();

  const {
    data: citas = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["citas", desde, hasta, estatus],
    queryFn: () => fetchCitas(desde, hasta, estatus),
    enabled: buscar,
  });

  const mutation = useMutation({
    mutationFn: async ({
      id,
      campo,
      valor,
    }: {
      id: number;
      campo:
        | "estatus_progreso_cita"
        | "estatus_concluido_cita"
        | "hoja_ayuda_pago_ventanilla";
      valor: boolean;
    }) => {
      const { error } = await supabase
        .from("operadores")
        .update({ [campo]: valor })
        .eq("numero_consecutivo", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["citas", desde, hasta, estatus],
      });
    },
  });

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!buscar) setBuscar(true);
    else refetch();
  }

  const filtradas = citas.filter((c) => {
    const txt = busqueda.toLowerCase();
    if (!txt) return true;
    return (
      (c.curp ?? "").toLowerCase().includes(txt) ||
      nombreCompleto(c).toLowerCase().includes(txt)
    );
  });

  const counts = {
    total: citas.length,
    pendiente: citas.filter(
      (c) => !c.estatus_progreso_cita && !c.estatus_concluido_cita,
    ).length,
    progreso: citas.filter(
      (c) => c.estatus_progreso_cita && !c.estatus_concluido_cita,
    ).length,
    concluido: citas.filter((c) => c.estatus_concluido_cita).length,
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">🗓️</span> Cita y Ruta
          </h1>
          <p className="page-subtitle">
            Gestión de cita SCT y traslado: fecha, punto de reunión, pagos y
            estatus.
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
            />
          </div>
          <div className="form-field">
            <label>Fecha solicitud (hasta)</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Estatus de cita</label>
            <select
              value={estatus}
              onChange={(e) => setEstatus(e.target.value as FiltroEstatus)}
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="progreso">En progreso</option>
              <option value="concluido">Concluido</option>
            </select>
          </div>
          <div className="form-field form-field-center">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Cargando…" : "Consultar"}
            </button>
          </div>
        </div>
      </form>

      {/* Contadores rápidos */}
      {citas.length > 0 && (
        <div className="summary-bar" style={{ marginTop: "16px" }}>
          <div className="summary-item">
            <span className="summary-label">Total</span>
            <span className="summary-value">{counts.total}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Pendientes</span>
            <span className={`summary-value ${counts.pendiente > 0 ? "summary-value--red" : ""}`}>
              {counts.pendiente}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">En progreso</span>
            <span className="summary-value" style={{ color: "#1d4ed8" }}>
              {counts.progreso}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Concluidos</span>
            <span className="summary-value summary-value--green">
              {counts.concluido}
            </span>
          </div>
        </div>
      )}

      {isError && (
        <div className="alert-error">Error: {(error as Error).message}</div>
      )}

      {/* Búsqueda en resultados */}
      {citas.length > 0 && (
        <div className="toolbar" style={{ marginTop: "16px" }}>
          <input
            className="search-input"
            type="text"
            placeholder="Filtrar por nombre o CURP..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <span className="record-count">
            {filtradas.length} de {citas.length}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="loading-state" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Cargando citas...</span>
        </div>
      )}

      {!isLoading && !isError && citas.length === 0 && (
        <div className="empty-report">
          <span>Sin resultados</span>
          <p>No hay citas para los filtros seleccionados.</p>
        </div>
      )}

      {!isLoading && filtradas.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: "16px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre completo</th>
                <th>CURP</th>
                <th>Teléfono</th>
                <th>F. Solicitada</th>
                <th>F. Asignada</th>
                <th>Contraseña LFD</th>
                <th>Hoja pago</th>
                <th>Estatus cita</th>
                <th>Traslado</th>
                <th>Est. traslado</th>
                <th>Ver</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => {
                const est = getEstatus(c);
                const tieneTraslado = !!c.fecha_traslado;
                return (
                  <tr key={c.numero_consecutivo}>
                    <td className="col-id">{c.numero_consecutivo}</td>
                    <td className="col-nombre">{nombreCompleto(c)}</td>
                    <td className="col-curp">{c.curp}</td>
                    <td>{c.telefono_1 ?? "—"}</td>
                    <td className="col-fecha">
                      {c.cita_fecha_solicitada ?? "—"}
                    </td>
                    <td className="col-fecha">
                      {c.cita_fecha_asignada ?? "—"}
                    </td>
                    <td>
                      {c.contrasena_lfd ? (
                        <span className="mono-tag">{c.contrasena_lfd}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!c.hoja_ayuda_pago_ventanilla}
                        onChange={(e) =>
                          mutation.mutate({
                            id: c.numero_consecutivo,
                            campo: "hoja_ayuda_pago_ventanilla",
                            valor: e.target.checked,
                          })
                        }
                        style={{ accentColor: "#2563eb", width: 16, height: 16 }}
                      />
                    </td>
                    <td>
                      <div className="estatus-cell">
                        <span className={`badge ${est.cls}`}>{est.label}</span>
                        <div className="mini-checks">
                          <label title="En progreso">
                            <input
                              type="checkbox"
                              checked={!!c.estatus_progreso_cita}
                              onChange={(e) =>
                                mutation.mutate({
                                  id: c.numero_consecutivo,
                                  campo: "estatus_progreso_cita",
                                  valor: e.target.checked,
                                })
                              }
                              style={{ accentColor: "#f59e0b" }}
                            />
                          </label>
                          <label title="Concluido">
                            <input
                              type="checkbox"
                              checked={!!c.estatus_concluido_cita}
                              onChange={(e) =>
                                mutation.mutate({
                                  id: c.numero_consecutivo,
                                  campo: "estatus_concluido_cita",
                                  valor: e.target.checked,
                                })
                              }
                              style={{ accentColor: "#16a34a" }}
                            />
                          </label>
                        </div>
                      </div>
                    </td>
                    <td className="col-fecha">
                      {tieneTraslado ? (
                        <span>
                          {c.fecha_traslado}
                          {c.punto_reunion && (
                            <span
                              className="field-hint"
                              style={{ display: "block" }}
                            >
                              {c.punto_reunion}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">Sin traslado</span>
                      )}
                    </td>
                    <td>
                      {tieneTraslado && (
                        <span
                          className={`badge ${c.estatus_concluido_traslado ? "badge--green" : c.estatus_progreso_traslado ? "badge--blue" : "badge--yellow"}`}
                        >
                          {c.estatus_concluido_traslado
                            ? "Listo"
                            : c.estatus_progreso_traslado
                              ? "Camino"
                              : "Pend."}
                        </span>
                      )}
                    </td>
                    <td>
                      <Link href={`/operadores/${c.numero_consecutivo}`}>
                        <button className="btn-edit">Editar</button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
