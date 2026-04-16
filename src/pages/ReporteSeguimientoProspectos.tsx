import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { etiquetaMedioCaptacion } from "../lib/mediosCaptacion";
import { asesorTonoClass } from "../lib/asesoresCatalogo";

type FilaProspecto = {
  numero_consecutivo: number;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  fecha_captacion: string | null;
  proxima_llamada: string | null;
  estatus_seguimiento: string | null;
  medio_captacion: string | null;
  asesor: string | null;
};

type TipoPeriodo = "semana_actual" | "mes_actual" | "personalizado" | "todos";

type Filtros = {
  periodo: TipoPeriodo;
  fecha_desde: string;
  fecha_hasta: string;
  asesor: string;
  estatus: string;
};

async function fetchProspectosSeguimiento(): Promise<FilaProspecto[]> {
  const { data, error } = await supabase
    .from("operadores")
    .select(
      "numero_consecutivo, nombre, apellido_paterno, apellido_materno, fecha_captacion, proxima_llamada, estatus_seguimiento, medio_captacion, asesor",
    )
    .eq("es_prospecto", true)
    .order("fecha_captacion", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as FilaProspecto[];
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatLocalISO(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inicioSemanaISO(base = new Date()) {
  const d = new Date(base);
  const day = d.getDay(); // 0 = domingo, 1 = lunes
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalISO(d);
}

function finSemanaISO(base = new Date()) {
  const d = new Date(base);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalISO(d);
}

function inicioMesISO(base = new Date()) {
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-01`;
}

function nombreCompleto(p: FilaProspecto) {
  return [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(" ");
}

function etiquetaEstatus(estatus: string | null) {
  const t = (estatus ?? "").trim();
  if (!t) return "Sin estatus";
  return t;
}

function claseBadgeEstatus(estatus: string | null) {
  const t = (estatus ?? "").trim().toLowerCase();
  if (!t) return "badge badge--gray";
  if (t === "agendado") return "badge badge--blue";
  if (t === "ingresado") return "badge badge--green";
  if (t === "seguimiento") return "badge badge--yellow";
  if (t === "no le interesa") return "badge badge--amber";
  return "badge badge--gray";
}

export default function ReporteSeguimientoProspectos() {
  const [, navigate] = useLocation();

  const [filtros, setFiltros] = useState<Filtros>({
    periodo: "semana_actual",
    fecha_desde: inicioSemanaISO(),
    fecha_hasta: finSemanaISO(),
    asesor: "",
    estatus: "",
  });

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["reporte_seguimiento_prospectos"],
    queryFn: fetchProspectosSeguimiento,
  });

  function setF<K extends keyof Filtros>(key: K, value: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [key]: value }));
  }

  function onChangePeriodo(v: TipoPeriodo) {
    if (v === "semana_actual") {
      setFiltros((prev) => ({
        ...prev,
        periodo: v,
        fecha_desde: inicioSemanaISO(),
        fecha_hasta: finSemanaISO(),
      }));
      return;
    }
    if (v === "mes_actual") {
      setFiltros((prev) => ({
        ...prev,
        periodo: v,
        fecha_desde: inicioMesISO(),
        fecha_hasta: hoyISO(),
      }));
      return;
    }
    if (v === "todos") {
      setFiltros((prev) => ({
        ...prev,
        periodo: v,
        fecha_desde: "",
        fecha_hasta: "",
      }));
      return;
    }
    setFiltros((prev) => ({ ...prev, periodo: v }));
  }

  const asesoresDisponibles = useMemo(() => {
    const unicos = new Set<string>();
    for (const row of data) {
      const asesor = (row.asesor ?? "").trim();
      if (asesor) unicos.add(asesor);
    }
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, "es"));
  }, [data]);

  const estatusDisponibles = useMemo(() => {
    const unicos = new Set<string>();
    for (const row of data) {
      const estatus = (row.estatus_seguimiento ?? "").trim();
      if (estatus) unicos.add(estatus);
    }
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, "es"));
  }, [data]);

  const filas = useMemo(() => {
    let rows = [...data];
    if (filtros.fecha_desde) {
      rows = rows.filter((r) => !!r.fecha_captacion && r.fecha_captacion >= filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      rows = rows.filter((r) => !!r.fecha_captacion && r.fecha_captacion <= filtros.fecha_hasta);
    }
    if (filtros.asesor === "__sin_asesor__") {
      rows = rows.filter((r) => !(r.asesor ?? "").trim());
    } else if (filtros.asesor) {
      rows = rows.filter((r) => (r.asesor ?? "").trim() === filtros.asesor);
    }
    if (filtros.estatus) {
      rows = rows.filter(
        (r) => (r.estatus_seguimiento ?? "").trim() === filtros.estatus,
      );
    }

    rows.sort((a, b) => {
      const fa = a.fecha_captacion ?? "";
      const fb = b.fecha_captacion ?? "";
      if (fa !== fb) return fa > fb ? -1 : 1;
      return b.numero_consecutivo - a.numero_consecutivo;
    });

    return rows;
  }, [data, filtros]);

  const kpis = useMemo(() => {
    const hoy = hoyISO();
    const semanaInicio = inicioSemanaISO();
    const semanaFin = finSemanaISO();
    const agendados = filas.filter(
      (r) => (r.estatus_seguimiento ?? "").trim().toLowerCase() === "agendado",
    ).length;
    const ingresados = filas.filter(
      (r) => (r.estatus_seguimiento ?? "").trim().toLowerCase() === "ingresado",
    ).length;
    const conLlamadaHoy = filas.filter((r) => r.proxima_llamada === hoy).length;
    const llamadasSemana = filas.filter(
      (r) =>
        !!r.proxima_llamada &&
        r.proxima_llamada >= semanaInicio &&
        r.proxima_llamada <= semanaFin,
    ).length;
    return {
      total: filas.length,
      agendados,
      ingresados,
      conLlamadaHoy,
      llamadasSemana,
    };
  }, [filas]);

  const resumenAsesores = useMemo(() => {
    const acc: Record<
      string,
      { asesor: string; total: number; agendados: number; ingresados: number }
    > = {};
    for (const row of filas) {
      const asesor = (row.asesor ?? "").trim() || "Sin asesor";
      if (!acc[asesor]) {
        acc[asesor] = { asesor, total: 0, agendados: 0, ingresados: 0 };
      }
      acc[asesor].total += 1;
      const estatus = (row.estatus_seguimiento ?? "").trim().toLowerCase();
      if (estatus === "agendado") acc[asesor].agendados += 1;
      if (estatus === "ingresado") acc[asesor].ingresados += 1;
    }
    return Object.values(acc).sort((a, b) => b.total - a.total);
  }, [filas]);

  return (
    <div className="page-container">
      <div className="page-header no-print">
        <button className="ghost-btn" type="button" onClick={() => navigate("/reportes")}>
          ← Reportes
        </button>
        <div>
          <h1 className="page-title">
            <span className="page-icon">📞</span> Seguimiento de Prospectos
          </h1>
          <p className="page-subtitle">
            Reporte para analizar captación semanal (lunes a domingo), responsables y estatus de seguimiento.
          </p>
        </div>
      </div>

      <div className="filter-card no-print">
        <div className="filter-grid">
          <div className="form-field">
            <label>Periodo de captación</label>
            <select
              value={filtros.periodo}
              onChange={(e) => onChangePeriodo(e.target.value as TipoPeriodo)}
            >
              <option value="semana_actual">Semana actual (lunes a domingo)</option>
              <option value="mes_actual">Mes actual</option>
              <option value="personalizado">Personalizado</option>
              <option value="todos">Todo el histórico</option>
            </select>
          </div>

          <div className="form-field">
            <label>Desde</label>
            <input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => {
                setF("periodo", "personalizado");
                setF("fecha_desde", e.target.value);
              }}
            />
          </div>

          <div className="form-field">
            <label>Hasta</label>
            <input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => {
                setF("periodo", "personalizado");
                setF("fecha_hasta", e.target.value);
              }}
            />
          </div>

          <div className="form-field">
            <label>Asesor</label>
            <select
              value={filtros.asesor}
              onChange={(e) => setF("asesor", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="__sin_asesor__">Sin asesor</option>
              {asesoresDisponibles.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Estatus</label>
            <select
              value={filtros.estatus}
              onChange={(e) => setF("estatus", e.target.value)}
            >
              <option value="">Todos</option>
              {estatusDisponibles.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isError && (
        <div className="alert-error no-print" style={{ marginTop: "12px" }}>
          Error: {(error as Error).message}
        </div>
      )}

      {isLoading && (
        <div className="loading-state no-print" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Cargando reporte de seguimiento...</span>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="summary-bar" style={{ marginTop: "20px" }}>
            <div className="summary-item">
              <span className="summary-label">Prospectos captados</span>
              <span className="summary-value">{kpis.total}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Agendados</span>
              <span className="summary-value">{kpis.agendados}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Ingresados</span>
              <span className="summary-value summary-value--green">{kpis.ingresados}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Llamadas hoy</span>
              <span className="summary-value">{kpis.conLlamadaHoy}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Llamadas esta semana</span>
              <span className="summary-value">{kpis.llamadasSemana}</span>
            </div>
          </div>

          {resumenAsesores.length > 0 && (
            <div className="promotor-resumen">
              <h3 className="section-subtitle" style={{ marginBottom: "10px" }}>
                Desglose por asesor
              </h3>
              <div className="promotor-chips">
                {resumenAsesores.map((a) => (
                  <div key={a.asesor} className="promotor-chip">
                    <strong>{a.asesor}</strong>
                    <span>{a.total} prospectos</span>
                    <span>Agendados: {a.agendados}</span>
                    <span>Ingresados: {a.ingresados}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="table-wrapper" style={{ marginTop: "14px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Captación</th>
                  <th>Asesor</th>
                  <th>Estatus</th>
                  <th>Próx. llamada</th>
                  <th>Medio</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      No hay prospectos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filas.map((row) => (
                    <tr key={row.numero_consecutivo}>
                      <td className="col-id">{row.numero_consecutivo}</td>
                      <td className="col-nombre">{nombreCompleto(row)}</td>
                      <td className="col-fecha">{row.fecha_captacion ?? "—"}</td>
                      <td>
                        <span className={asesorTonoClass(row.asesor)}>
                          {(row.asesor ?? "").trim() || "Sin asesor"}
                        </span>
                      </td>
                      <td>
                        <span className={claseBadgeEstatus(row.estatus_seguimiento)}>
                          {etiquetaEstatus(row.estatus_seguimiento)}
                        </span>
                      </td>
                      <td className="col-fecha">{row.proxima_llamada ?? "—"}</td>
                      <td>{etiquetaMedioCaptacion(row.medio_captacion)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filas.length > 0 && (
            <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
              <button type="button" className="ghost-btn" onClick={() => window.print()} style={{ width: "auto" }}>
                🖨️ Imprimir
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
