import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { joinNameParts } from "../lib/names";
import type { Promotor } from "../lib/types";

interface OperadorInfo {
  numero_consecutivo: number;
  hora: string | null;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  curp: string | null;
  licencia_numero: string | null;
  licencia_vigencia: string | null;
  direccion: string | null;
  telefono_1: string | null;
  escolaridad: string | null;
  quien_cobro_curso: string | null;
}

interface FilaCurso {
  id: number;
  fecha: string;
  fecha_solicitud_curso: string | null;
  servicio: string | null;
  promotor: string | null;
  costo: number;
  cobro: number;
  faltante: number;
  forma_pago: string;
  observaciones: string | null;
  operadores: OperadorInfo | null;
}

async function fetchPromotores(): Promise<Promotor[]> {
  const { data, error } = await supabase
    .from("promotores")
    .select("id_promotor, nombre, nick, orden, columna_servicios")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Promotor[];
}

async function fetchCursos(
  desde: string,
  hasta: string,
  idPromotor: string,
): Promise<FilaCurso[]> {
  let q = supabase
    .from("ventas")
    .select(`
      id,
      fecha,
      fecha_solicitud_curso,
      servicio,
      promotor,
      costo,
      cobro,
      faltante,
      forma_pago,
      observaciones,
      operadores!operador_id (
        numero_consecutivo,
        hora,
        nombre,
        apellido_paterno,
        apellido_materno,
        curp,
        licencia_numero,
        licencia_vigencia,
        direccion,
        telefono_1,
        escolaridad,
        quien_cobro_curso
      )
    `)
    .eq("tipo_servicio", 2)
    .eq("cancelado", false)
    .order("fecha_solicitud_curso", { ascending: true });

  if (desde) q = q.gte("fecha_solicitud_curso", desde);
  if (hasta) q = q.lte("fecha_solicitud_curso", hasta);
  if (idPromotor) q = q.eq("id_promotor", Number(idPromotor));

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilaCurso[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n ?? 0);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function formatearFechaCorta(valor: string | null | undefined) {
  if (!valor) return "";
  const [anio = "", mes = "", dia = ""] = valor.slice(0, 10).split("-");
  if (!anio || !mes || !dia) return valor;
  return `${dia}/${mes}/${anio}`;
}

async function exportarExcel(cursos: FilaCurso[], nombrePromotor: string) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AppLic";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Peticion Cursos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  if (!worksheet) {
    throw new Error("No se pudo crear la hoja de peticion.");
  }

  const columnas = [
    { key: "A", width: 15.71, header: "Número.\nCONSECUTIVO" },
    { key: "B", width: 15, header: "HORA  (CTRL\n+ SHIFT +\nPUNTO)" },
    { key: "C", width: 34.14, header: "NOMBRE CAPACITANDO" },
    { key: "D", width: 10.14, header: "CCyA" },
    { key: "E", width: 10.14, header: "CCyA" },
    { key: "F", width: 10.71, header: "FECHA" },
    { key: "G", width: 13.5, header: "SERVICIOS" },
    { key: "H", width: 10.14, header: "CCyA" },
    { key: "I", width: 25.71, header: "CURP" },
    { key: "J", width: 13.29, header: "No. DE LICENCIA" },
    { key: "K", width: 42.57, header: "DIRECCION" },
    { key: "L", width: 13.14, header: "TELEFONO" },
    { key: "M", width: 8.71, header: "QUIEN COBRO" },
    { key: "N", width: 14.14, header: "GESTOR" },
    { key: "O", width: 13.43, header: "ESCOLARIDAD" },
    { key: "P", width: 10.14, header: "CCyA" },
    { key: "Q", width: 42.86, header: "OBSERVACIONES" },
  ] as const;
  const serviciosCurso = [
    { codigo: "R A N", descripcion: "Renovación en A Nacional" },
    { codigo: "R A I", descripcion: "Renovación en A Internacional" },
    { codigo: "R B N", descripcion: "Renovación en B Nacional" },
    { codigo: "R B I", descripcion: "Renovación en B Internacional" },
    { codigo: "R C N", descripcion: "Renovación en C Nacional" },
    { codigo: "R C I", descripcion: "Renovación en C Internacional" },
    { codigo: "R E MRP", descripcion: "Renovación en E Materiales y Residuos Peligrosos" },
    { codigo: "R E TSS-TSR", descripcion: "Renovación en E Doblemente Articulado" },
    { codigo: "O A N", descripcion: "Obtención en A Nacional" },
    { codigo: "O A I", descripcion: "Obtención en A Internacional" },
    { codigo: "O SE BN", descripcion: "Obtención Sin Experiencia B Nacional" },
    { codigo: "O SE BI", descripcion: "Obtención Sin Experiencia B Internacional" },
    { codigo: "O C E BN", descripcion: "Obtención Con Experiencia B Nacional" },
    { codigo: "O C E BI", descripcion: "Obtención Con Experiencia B Internacional" },
    { codigo: "O SE CN", descripcion: "Obtención Sin Experiencia C Nacional" },
    { codigo: "O SE CI", descripcion: "Obtención Sin Experiencia C Internacional" },
    { codigo: "O C E CN", descripcion: "Obtención Con Experiencia C Nacional" },
    { codigo: "O C E CI", descripcion: "Obtención Con Experiencia C Internacional" },
  ];
  const columnasRojas = new Set(["D", "E", "H", "P"]);
  const colorEncabezado = "FF92D8F2";
  const bordeDelgado = {
    top: { style: "thin" as const, color: { argb: "FF000000" } },
    left: { style: "thin" as const, color: { argb: "FF000000" } },
    bottom: { style: "thin" as const, color: { argb: "FF000000" } },
    right: { style: "thin" as const, color: { argb: "FF000000" } },
  };

  columnas.forEach(({ key, width, header }) => {
    worksheet.getColumn(key).width = width;
    const cell = worksheet.getCell(`${key}1`);
    cell.value = header;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorEncabezado },
    };
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: columnasRojas.has(key) ? "FFFF0000" : "FF000000" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = bordeDelgado;
  });

  worksheet.getColumn("S").width = 20;
  worksheet.getColumn("T").width = 64;
  worksheet.getCell("S1").value = "SERVICIO";
  worksheet.getCell("T1").value = "DESCRIPCION";
  ["S1", "T1"].forEach((addr) => {
    const cell = worksheet.getCell(addr);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorEncabezado },
    };
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: "FF000000" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = bordeDelgado;
  });
  serviciosCurso.forEach((servicio, index) => {
    const rowNumber = index + 2;
    worksheet.getCell(`S${rowNumber}`).value = servicio.codigo;
    worksheet.getCell(`T${rowNumber}`).value = servicio.descripcion;
    worksheet.getRow(rowNumber).height = 20;
  });
  worksheet.getColumn("S").hidden = false;
  worksheet.getColumn("T").hidden = false;

  cursos.forEach((curso, index) => {
    const op = curso.operadores;
    const nombreCompleto = op ? joinNameParts(op.nombre, op.apellido_paterno, op.apellido_materno) : "";
    const rowNumber = index + 2;
    const values: Record<string, string | number> = {
      A: index + 1,
      B: op?.hora ?? "",
      C: nombreCompleto,
      F: formatearFechaCorta(curso.fecha_solicitud_curso),
      G: curso.servicio ?? "",
      I: op?.curp ?? "",
      J: op?.licencia_numero ?? "",
      K: op?.direccion ?? "",
      L: op?.telefono_1 ?? "",
      M: "ECA",
      N: curso.promotor ?? "",
      O: op?.escolaridad ?? "",
      Q: curso.observaciones ?? "",
    };

    for (const [key, value] of Object.entries(values)) {
      const cell = worksheet.getCell(`${key}${rowNumber}`);
      cell.value = value;
      cell.font = {
        name: "Arial",
        size: 10,
        color: { argb: "FF000000" },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: key === "C" || key === "K" || key === "Q" ? "left" : "center",
        wrapText: true,
      };
      cell.border = bordeDelgado;
    }
    worksheet.getRow(rowNumber).height = 24;
  });

  for (let rowNumber = 2; rowNumber <= 213; rowNumber += 1) {
    worksheet.getCell(`G${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`$S$2:$S$${serviciosCurso.length + 1}`],
      showErrorMessage: true,
      errorTitle: "Servicio no valido",
      error: "Selecciona un servicio de la lista desplegable.",
    };
  }

  for (let rowNumber = 2; rowNumber <= 213; rowNumber += 1) {
    for (const key of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"] as const) {
      const cell = worksheet.getCell(`${key}${rowNumber}`);
      if (!cell.value) {
        cell.border = bordeDelgado;
      }
    }
  }

  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.45,
      bottom: 0.45,
      header: 0.25,
      footer: 0.25,
    },
  };
  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fecha = hoy();
  const sufijo = nombrePromotor ? `_${nombrePromotor.replace(/\s+/g, "_")}` : "";
  link.href = url;
  link.download = `Peticion_Cursos${sufijo}_${fecha}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function PeticionCursos() {
  const [, navigate] = useLocation();
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [idPromotor, setIdPromotor] = useState("");
  const [buscar, setBuscar] = useState(false);

  const { data: promotores = [] } = useQuery({
    queryKey: ["promotores"],
    queryFn: fetchPromotores,
  });

  const {
    data: cursos = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["peticion-cursos", desde, hasta, idPromotor],
    queryFn: () => fetchCursos(desde, hasta, idPromotor),
    enabled: buscar,
  });

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!buscar) setBuscar(true);
    else refetch();
  }

  const nombrePromotor =
    promotores.find((p) => String(p.id_promotor) === idPromotor)?.nombre ?? "";

  const totalCosto = cursos.reduce((s, c) => s + c.costo, 0);
  const totalCobrado = cursos.reduce((s, c) => s + c.cobro, 0);
  const totalFaltante = cursos.reduce((s, c) => s + (c.faltante ?? 0), 0);

  return (
    <div className="page-container">
      <div className="page-header no-print">
        <button className="ghost-btn" type="button" onClick={() => navigate("/reportes")}>
          {"<-"} Reportes
        </button>
        <div>
          <h1 className="page-title">
            <span className="page-icon">{"\u{1F4DD}"}</span> Peticion de Cursos
          </h1>
          <p className="page-subtitle">
            Ventas de tipo curso con datos del expediente del operador.
          </p>
        </div>
      </div>

      <form onSubmit={handleBuscar} className="filter-card no-print">
        <div className="filter-grid">
          <div className="form-field">
            <label>Fecha solicitud (desde)</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Fecha solicitud (hasta)</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Promotor</label>
            <select value={idPromotor} onChange={(e) => setIdPromotor(e.target.value)}>
              <option value="">-- Todos --</option>
              {promotores.map((p) => (
                <option key={p.id_promotor} value={p.id_promotor}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field form-field-center">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Cargando..." : "Buscar"}
            </button>
          </div>
        </div>
      </form>

      {isError && <div className="alert-error">Error: {(error as Error).message}</div>}

      {isLoading && (
        <div className="loading-state" style={{ marginTop: "20px" }}>
          <div className="spinner" />
          <span>Cargando...</span>
        </div>
      )}

      {!isLoading && buscar && cursos.length === 0 && !isError && (
        <div className="empty-report">
          <span>Sin resultados</span>
          <p>No hay peticiones de curso para los filtros seleccionados.</p>
        </div>
      )}

      {cursos.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "20px",
              flexWrap: "wrap",
            }}
          >
            <div className="summary-bar" style={{ margin: 0, flex: 1 }}>
              <div className="summary-item">
                <span className="summary-label">Registros</span>
                <span className="summary-value">{cursos.length}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Total facturado</span>
                <span className="summary-value">{fmt(totalCosto)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Total cobrado</span>
                <span className="summary-value summary-value--green">{fmt(totalCobrado)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Faltante</span>
                <span
                  className={`summary-value ${
                    totalFaltante > 0 ? "summary-value--red" : "summary-value--green"
                  }`}
                >
                  {fmt(totalFaltante)}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                void exportarExcel(cursos, nombrePromotor).catch((err) => {
                  alert(err instanceof Error ? err.message : "No se pudo generar el Excel.");
                });
              }}
              style={{ whiteSpace: "nowrap" }}
            >
              Descargar Excel
            </button>
          </div>

          <div className="table-wrapper" style={{ marginTop: "16px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha solicitud</th>
                  <th>Operador</th>
                  <th>CURP</th>
                  <th>Servicio</th>
                  <th>Promotor</th>
                  <th>Costo</th>
                  <th>Cobro</th>
                  <th>Faltante</th>
                  <th>Forma pago</th>
                </tr>
              </thead>
              <tbody>
                {cursos.map((c) => {
                  const op = c.operadores;
                  const nombreCompleto = op
                    ? joinNameParts(op.nombre, op.apellido_paterno, op.apellido_materno)
                    : "-";
                  return (
                    <tr key={c.id}>
                      <td className="col-id">{c.id}</td>
                      <td className="col-fecha">{c.fecha_solicitud_curso ?? "-"}</td>
                      <td>{nombreCompleto}</td>
                      <td style={{ fontSize: "0.8em" }}>{op?.curp ?? "-"}</td>
                      <td>{c.servicio ?? "-"}</td>
                      <td>{c.promotor ?? "-"}</td>
                      <td className="col-money">{fmt(c.costo)}</td>
                      <td className="col-money col-money--green">{fmt(c.cobro)}</td>
                      <td
                        className={`col-money ${
                          (c.faltante ?? 0) > 0 ? "col-money--red" : "col-money--green"
                        }`}
                      >
                        {fmt(c.faltante ?? 0)}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            c.forma_pago === "Efectivo"
                              ? "badge--gray"
                              : c.forma_pago === "Dividida"
                                ? "badge--amber"
                                : "badge--blue"
                          }`}
                        >
                          {c.forma_pago}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={6}>
                    <strong>TOTAL ({cursos.length} registros)</strong>
                  </td>
                  <td className="col-money">
                    <strong>{fmt(totalCosto)}</strong>
                  </td>
                  <td className="col-money col-money--green">
                    <strong>{fmt(totalCobrado)}</strong>
                  </td>
                  <td
                    className={`col-money ${
                      totalFaltante > 0 ? "col-money--red" : "col-money--green"
                    }`}
                  >
                    <strong>{fmt(totalFaltante)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
