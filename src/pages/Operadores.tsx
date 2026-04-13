import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Operador } from "../lib/types";

async function fetchOperadores(): Promise<Operador[]> {
  const { data, error } = await supabase
    .from("operadores")
    .select("numero_consecutivo, fecha, nombre, apellido_paterno, apellido_materno, curp, telefono_1, licencia_numero, es_prospecto, promotores(nombre)")
    .order("numero_consecutivo", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Operador[];
}

export default function Operadores() {
  const [busqueda, setBusqueda] = useState("");

  const { data: operadores = [], isLoading, isError, error } = useQuery({
    queryKey: ["operadores"],
    queryFn: fetchOperadores,
  });

  const filtrados = operadores.filter((op) => {
    const texto = busqueda.toLowerCase();
    const nombre = `${op.nombre ?? ""} ${op.apellido_paterno ?? ""} ${op.apellido_materno ?? ""}`.toLowerCase();
    const curp = (op.curp ?? "").toLowerCase();
    const tel = (op.telefono_1 ?? "").toLowerCase();
    return nombre.includes(texto) || curp.includes(texto) || tel.includes(texto);
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">👤</span> Operadores
          </h1>
          <p className="page-subtitle">
            Registro y consulta de operadores. Datos personales, documentos,
            licencia y curso. Usa «Ventas» para ir al historial de ventas del operador.
          </p>
        </div>
        <Link href="/operadores/nuevo">
          <button className="btn-primary">+ Nuevo Operador</button>
        </Link>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Buscar por nombre, CURP o teléfono..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <span className="record-count">
          {isLoading ? "Cargando..." : `${filtrados.length} registro${filtrados.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {isError && (
        <div className="alert-error">
          Error al cargar operadores: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre completo</th>
                <th>CURP</th>
                <th>Teléfono</th>
                <th>Promotor</th>
                <th>Licencia</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty">
                    {busqueda
                      ? "No hay resultados para la búsqueda."
                      : "No hay operadores registrados. Crea el primero."}
                  </td>
                </tr>
              ) : (
                filtrados.map((op) => (
                  <tr key={op.numero_consecutivo}>
                    <td className="col-id">{op.numero_consecutivo}</td>
                    <td className="col-nombre">
                      {[op.nombre, op.apellido_paterno, op.apellido_materno]
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                    <td className="col-curp">{op.curp ?? "—"}</td>
                    <td>{op.telefono_1 ?? "—"}</td>
                    <td>
                      {op.promotores
                        ? op.promotores.nombre
                        : "—"}
                    </td>
                    <td>{op.licencia_numero ?? "—"}</td>
                    <td>
                      {op.es_prospecto ? (
                        <span className="badge badge--amber">Prospecto</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="col-fecha">{op.fecha ?? "—"}</td>
                    <td>
                      <div className="operadores-acciones">
                        <Link href={`/operadores/${op.numero_consecutivo}`}>
                          <button type="button" className="btn-edit">
                            Ver
                          </button>
                        </Link>
                        <Link
                          href={`/operadores/${op.numero_consecutivo}#historial-ventas-operador`}
                        >
                          <button type="button" className="btn-secondary btn-secondary--small">
                            Ventas
                          </button>
                        </Link>
                      </div>
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
          <span>Cargando operadores...</span>
        </div>
      )}
    </div>
  );
}
