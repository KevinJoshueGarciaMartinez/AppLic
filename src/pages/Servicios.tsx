import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

type ServicioAdmin = {
  id_servicio: number;
  orden: number;
  servicio: string;
  tipo_servicio: number | null;
  costo_base: number;
  com_1: number;
  activo: boolean;
  costo_abierto: boolean;
};

type ServicioForm = {
  id_servicio: number | null;
  servicio: string;
  tipo_servicio: string;
  costo_base: string;
  com_1: string;
  orden: string;
  costo_abierto: boolean;
};

const EMPTY_FORM: ServicioForm = {
  id_servicio: null,
  servicio: "",
  tipo_servicio: "1",
  costo_base: "0",
  com_1: "0",
  orden: "0",
  costo_abierto: false,
};

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value);
}

async function fetchServiciosAdmin(): Promise<ServicioAdmin[]> {
  const { data, error } = await supabase
    .from("catalogo_servicios_costos")
    .select("id_servicio, orden, servicio, tipo_servicio, costo_base, com_1, activo, costo_abierto")
    .order("orden", { ascending: true })
    .order("servicio", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ServicioAdmin[];
}

export default function Servicios() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);
  const [form, setForm] = useState<ServicioForm | null>(null);
  const [mensaje, setMensaje] = useState("");

  const { data: servicios = [], isLoading, isError, error } = useQuery({
    queryKey: ["servicios_admin"],
    queryFn: fetchServiciosAdmin,
  });

  const guardar = useMutation({
    mutationFn: async (values: ServicioForm) => {
      const nombre = values.servicio.trim();
      const costo = Number(values.costo_base || 0);
      const comision = Number(values.com_1 || 0);
      const orden = Number(values.orden || 0);
      if (nombre.length < 2) throw new Error("CAPTURA EL NOMBRE DEL SERVICIO.");
      if (![costo, comision, orden].every(Number.isFinite)) {
        throw new Error("REVISA LOS IMPORTES Y EL ORDEN.");
      }

      const { error: rpcError } = await supabase.rpc("guardar_catalogo_servicio", {
        p_id_servicio: values.id_servicio,
        p_servicio: nombre,
        p_tipo_servicio: values.tipo_servicio === "" ? null : Number(values.tipo_servicio),
        p_costo_base: costo,
        p_com_1: comision,
        p_orden: orden,
        p_costo_abierto: values.costo_abierto,
      });
      if (rpcError) throw new Error(rpcError.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servicios_admin"] }),
        queryClient.invalidateQueries({ queryKey: ["servicios"] }),
      ]);
      setForm(null);
      setMensaje("SERVICIO GUARDADO.");
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, activo }: { id: number; activo: boolean }) => {
      const { error: rpcError } = await supabase.rpc("cambiar_estado_catalogo_servicio", {
        p_id_servicio: id,
        p_activo: activo,
      });
      if (rpcError) throw new Error(rpcError.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servicios_admin"] }),
        queryClient.invalidateQueries({ queryKey: ["servicios"] }),
      ]);
      setMensaje("ESTADO DEL SERVICIO ACTUALIZADO.");
    },
  });

  const filtrados = useMemo(() => {
    const needle = busqueda.trim().toLowerCase();
    return servicios.filter((servicio) => {
      if (soloActivos && !servicio.activo) return false;
      return !needle || servicio.servicio.toLowerCase().includes(needle);
    });
  }, [busqueda, servicios, soloActivos]);

  function editar(servicio: ServicioAdmin) {
    setMensaje("");
    setForm({
      id_servicio: servicio.id_servicio,
      servicio: servicio.servicio,
      tipo_servicio: servicio.tipo_servicio == null ? "" : String(servicio.tipo_servicio),
      costo_base: String(servicio.costo_base),
      com_1: String(servicio.com_1),
      orden: String(servicio.orden),
      costo_abierto: servicio.costo_abierto,
    });
  }

  const mutationError = guardar.error ?? cambiarEstado.error;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-icon">⚙</span> SERVICIOS</h1>
          <p className="page-subtitle">
            ADMINISTRA LOS CONCEPTOS DISPONIBLES EN NUEVA VENTA, SU COSTO Y COMISION.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const nextOrder = servicios.reduce((max, s) => Math.max(max, s.orden), 0) + 1;
            setMensaje("");
            setForm({ ...EMPTY_FORM, orden: String(nextOrder) });
          }}
        >
          + NUEVO SERVICIO
        </button>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="BUSCAR SERVICIO..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button
          type="button"
          className={`btn-secondary${soloActivos ? " btn-secondary--active" : ""}`}
          onClick={() => setSoloActivos((value) => !value)}
        >
          {soloActivos ? "MOSTRAR INACTIVOS" : "OCULTAR INACTIVOS"}
        </button>
        <span className="record-count">{filtrados.length} SERVICIOS</span>
      </div>

      {mensaje && <div className="alert-success">{mensaje}</div>}
      {(isError || mutationError) && (
        <div className="alert-error">
          {(mutationError as Error | null)?.message ?? (error as Error)?.message}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ORDEN</th>
                <th>SERVICIO</th>
                <th>MODALIDAD</th>
                <th>COSTO</th>
                <th>COMISION</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={7} className="table-empty">NO HAY SERVICIOS PARA MOSTRAR.</td></tr>
              ) : filtrados.map((servicio) => (
                <tr key={servicio.id_servicio}>
                  <td>{servicio.orden}</td>
                  <td><strong>{servicio.servicio}</strong></td>
                  <td>
                    <span className={`badge ${servicio.costo_abierto ? "badge--blue" : "badge--gray"}`}>
                      {servicio.costo_abierto ? "IMPORTE ABIERTO" : "COSTO FIJO"}
                    </span>
                  </td>
                  <td>{servicio.costo_abierto ? "SE CAPTURA EN VENTA" : money(servicio.costo_base)}</td>
                  <td>{money(servicio.com_1)}</td>
                  <td><span className={`badge ${servicio.activo ? "badge--green" : "badge--gray"}`}>{servicio.activo ? "ACTIVO" : "INACTIVO"}</span></td>
                  <td className="col-actions">
                    <button type="button" className="btn-secondary" onClick={() => editar(servicio)}>EDITAR</button>
                    <button
                      type="button"
                      className={servicio.activo ? "btn-danger" : "btn-secondary"}
                      disabled={cambiarEstado.isPending}
                      onClick={() => {
                        const accion = servicio.activo ? "DESACTIVAR" : "ACTIVAR";
                        if (window.confirm(`${accion} ${servicio.servicio}?`)) {
                          cambiarEstado.mutate({ id: servicio.id_servicio, activo: !servicio.activo });
                        }
                      }}
                    >
                      {servicio.activo ? "DESACTIVAR" : "ACTIVAR"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <form
            className="modal-card modal-card--lg servicios-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); guardar.mutate(form); }}
          >
            <div className="servicios-modal-header">
              <div className="servicios-modal-heading">
                <span className="servicios-modal-icon">⚙</span>
                <div>
                  <h2 className="modal-title">{form.id_servicio == null ? "NUEVO SERVICIO" : "EDITAR SERVICIO"}</h2>
                  <p>CONFIGURA COMO APARECERA EN NUEVA VENTA.</p>
                </div>
              </div>
              <button type="button" className="servicios-modal-close" onClick={() => setForm(null)} aria-label="CERRAR">×</button>
            </div>

            <div className="servicios-form-grid">
              <label className="servicios-form-field servicios-form-field--full">
                <span>NOMBRE DEL SERVICIO *</span>
                <input className="servicios-form-control" value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} required autoFocus />
              </label>
              <label className="servicios-form-field">
                <span>ORDEN</span>
                <input className="servicios-form-control" type="number" min="0" value={form.orden} onChange={(e) => setForm({ ...form, orden: e.target.value })} />
                <small>POSICION EN LA LISTA.</small>
              </label>
              <label className="servicios-form-field">
                <span>TIPO</span>
                <input className="servicios-form-control" type="number" min="0" value={form.tipo_servicio} onChange={(e) => setForm({ ...form, tipo_servicio: e.target.value })} />
                <small>CLASIFICACION INTERNA.</small>
              </label>
              <label className="servicios-form-field">
                <span>COSTO BASE</span>
                <div className="servicios-money-control">
                  <span>$</span>
                  <input className="servicios-form-control" type="number" min="0" step="0.01" disabled={form.costo_abierto} value={form.costo_base} onChange={(e) => setForm({ ...form, costo_base: e.target.value })} />
                </div>
              </label>
              <label className="servicios-form-field">
                <span>COMISION</span>
                <div className="servicios-money-control">
                  <span>$</span>
                  <input className="servicios-form-control" type="number" min="0" step="0.01" value={form.com_1} onChange={(e) => setForm({ ...form, com_1: e.target.value })} />
                </div>
              </label>
              <label className={`servicios-open-toggle servicios-form-field--full${form.costo_abierto ? " servicios-open-toggle--active" : ""}`}>
                <input type="checkbox" checked={form.costo_abierto} onChange={(e) => setForm({ ...form, costo_abierto: e.target.checked })} />
                <span className="servicios-toggle-control" aria-hidden="true"><i /></span>
                <span>
                  <strong>IMPORTE ABIERTO</strong>
                  <small>EL COSTO SE CAPTURA AL MOMENTO DE HACER LA VENTA.</small>
                </span>
              </label>
            </div>
            <div className="modal-actions servicios-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>CANCELAR</button>
              <button type="submit" className="btn-primary" disabled={guardar.isPending}>{guardar.isPending ? "GUARDANDO..." : "GUARDAR"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
