import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

type Nivel = {
  id_nivel: number;
  nivel_usuario: string;
};

type UsuarioRow = {
  id_usuario: string;
  nombre_usuario: string | null;
  usuario: string | null;
  id_nivel: number | null;
  activo: boolean;
  created_at: string;
  usuarios_nivel: Nivel | null;
};

async function fetchNiveles(): Promise<Nivel[]> {
  const { data, error } = await supabase
    .from("usuarios_nivel")
    .select("id_nivel, nivel_usuario")
    .order("nivel_usuario", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Nivel[];
}

async function fetchUsuarios(): Promise<UsuarioRow[]> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id_usuario, nombre_usuario, usuario, id_nivel, activo, created_at, usuarios_nivel(id_nivel, nivel_usuario)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as UsuarioRow[];
}

export default function Usuarios() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");

  const { data: niveles = [] } = useQuery({
    queryKey: ["usuarios_nivel"],
    queryFn: fetchNiveles,
  });

  const {
    data: usuarios = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["usuarios_admin"],
    queryFn: fetchUsuarios,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      idUsuario,
      idNivel,
      activo,
    }: {
      idUsuario: string;
      idNivel: number | null;
      activo?: boolean;
    }) => {
      const payload: { id_nivel?: number | null; activo?: boolean; updated_at: string } = {
        updated_at: new Date().toISOString(),
      };
      if (idNivel !== undefined) payload.id_nivel = idNivel;
      if (activo !== undefined) payload.activo = activo;

      const { error: updateError } = await supabase
        .from("usuarios")
        .update(payload)
        .eq("id_usuario", idUsuario);

      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["usuarios_admin"] });
    },
  });

  const filtrados = useMemo(() => {
    const txt = busqueda.toLowerCase().trim();
    if (!txt) return usuarios;
    return usuarios.filter((u) => {
      const correo = (u.usuario ?? "").toLowerCase();
      const nombre = (u.nombre_usuario ?? "").toLowerCase();
      const nivel = (u.usuarios_nivel?.nivel_usuario ?? "sin nivel").toLowerCase();
      return correo.includes(txt) || nombre.includes(txt) || nivel.includes(txt);
    });
  }, [usuarios, busqueda]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">🔐</span> Usuarios
          </h1>
          <p className="page-subtitle">
            Solo administradores: asigna nivel de acceso y estado activo para habilitar el uso del sistema.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Buscar por correo, nombre o nivel..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <span className="record-count">
          {isLoading ? "Cargando..." : `${filtrados.length} usuario${filtrados.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {isError && (
        <div className="alert-error">
          Error al cargar usuarios: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Nombre</th>
                <th>Nivel</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    No hay usuarios para mostrar.
                  </td>
                </tr>
              ) : (
                filtrados.map((u) => (
                  <tr key={u.id_usuario}>
                    <td>{u.usuario ?? "—"}</td>
                    <td>{u.nombre_usuario ?? "—"}</td>
                    <td style={{ minWidth: "200px" }}>
                      <select
                        className="search-input"
                        value={u.id_nivel ?? ""}
                        onChange={(e) => {
                          const value = e.target.value ? Number(e.target.value) : null;
                          updateMutation.mutate({ idUsuario: u.id_usuario, idNivel: value });
                        }}
                        disabled={updateMutation.isPending}
                      >
                        <option value="">Sin nivel</option>
                        {niveles.map((n) => (
                          <option key={n.id_nivel} value={n.id_nivel}>
                            {n.nivel_usuario}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.activo ? "badge--green" : "badge--gray"}`}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          updateMutation.mutate({
                            idUsuario: u.id_usuario,
                            idNivel: u.id_nivel,
                            activo: !u.activo,
                          })
                        }
                        disabled={updateMutation.isPending}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
