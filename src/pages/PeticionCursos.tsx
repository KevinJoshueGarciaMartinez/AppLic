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
  const plantillaUrl = "/templates/FORMATO_DE_PETICIONES_ECA.xlsx";
  const plantilla = await fetch(plantillaUrl).then((res) => {
    if (!res.ok) {
      throw new Error(`No se pudo cargar la plantilla de peticion (${res.status})`);
    }
    return res.arrayBuffer();
  });

  await workbook.xlsx.load(plantilla);
  workbook.creator = "AppLic";
  workbook.modified = new Date();

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("La plantilla de peticion no contiene una hoja valida.");
  }

  const columnas = [
    { key: "A", width: 15.71 },
    { key: "B", width: 15 },
    { key: "C", width: 34.14 },
    { key: "D", width: 6.57 },
    { key: "E", width: 5.71 },
    { key: "F", width: 10.71 },
    { key: "G", width: 11.29 },
    { key: "H", width: 5.57 },
    { key: "I", width: 25.71 },
    { key: "J", width: 13.29 },
    { key: "K", width: 42.57 },
    { key: "L", width: 13.14 },
    { key: "M", width: 8.71 },
    { key: "N", width: 14.14 },
    { key: "O", width: 13.43 },
    { key: "P", width: 10.86 },
    { key: "Q", width: 42.86 },
  ] as const;
  const columnaCentral = new Set(["B", "F", "I", "L", "M"]);
  const columnasTextoLargo = new Set(["C", "G", "K", "N", "O", "Q"]);

  columnas.forEach(({ key, width }) => {
    worksheet.getColumn(key).width = width;
  });

  cursos.forEach((curso, index) => {
    const rowNumber = index + 2;
    const op = curso.operadores;
    const nombreCompleto = joinNameParts(
      op?.nombre,
      op?.apellido_paterno,
      op?.apellido_materno,
    );

    worksheet.getCell(`A${rowNumber}`).value = index + 1;
    worksheet.getCell(`B${rowNumber}`).value = op?.hora ?? "";
    worksheet.getCell(`C${rowNumber}`).value = nombreCompleto;
    worksheet.getCell(`D${rowNumber}`).value = "";
    worksheet.getCell(`E${rowNumber}`).value = "";
    worksheet.getCell(`F${rowNumber}`).value = formatearFechaCorta(curso.fecha_solicitud_curso);
    worksheet.getCell(`G${rowNumber}`).value = curso.servicio ?? "";
    worksheet.getCell(`H${rowNumber}`).value = "";
    worksheet.getCell(`I${rowNumber}`).value = op?.curp ?? "";
    worksheet.getCell(`J${rowNumber}`).value = op?.licencia_numero ?? "";
    worksheet.getCell(`K${rowNumber}`).value = op?.direccion ?? "";
    worksheet.getCell(`L${rowNumber}`).value = op?.telefono_1 ?? "";
    worksheet.getCell(`M${rowNumber}`).value = "ECA";
    worksheet.getCell(`N${rowNumber}`).value = curso.promotor ?? "";
    worksheet.getCell(`O${rowNumber}`).value = op?.escolaridad ?? "";
    worksheet.getCell(`P${rowNumber}`).value = "";
    worksheet.getCell(`Q${rowNumber}`).value = curso.observaciones ?? "";
    worksheet.getRow(rowNumber).height = 24;

    columnas.forEach(({ key }) => {
      const cell = worksheet.getCell(`${key}${rowNumber}`);
      cell.font = {
        name: "Aptos Narrow",
        size: 11,
        color: { argb: "FF000000" },
      };

      if (columnaCentral.has(key)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (columnasTextoLargo.has(key)) {
        cell.alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        };
      } else {
        cell.alignment = { vertical: "middle" };
      }
    });
  });

  for (let rowNumber = cursos.length + 2; rowNumber <= 213; rowNumber += 1) {
    for (const key of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"] as const) {
      worksheet.getCell(`${key}${rowNumber}`).value = "";
    }
  }

  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
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
