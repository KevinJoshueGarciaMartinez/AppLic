import type { ReactNode } from "react";
import { useState } from "react";
import { Link, Route, Switch } from "wouter";
import { supabase } from "./lib/supabase";

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>AppLic ERP</h1>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ventas">Ventas</Link>
          <Link href="/servicios">Servicios</Link>
          <Link href="/reportes">Reportes</Link>
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function SetupChecklist() {
  const [supabaseStatus, setSupabaseStatus] = useState<
    "pendiente" | "ok" | "error"
  >("pendiente");
  const [supabaseMessage, setSupabaseMessage] = useState(
    "Sin validar todavia.",
  );

  const checkSupabase = async () => {
    try {
      const { error } = await supabase.auth.getSession();
      if (error) {
        setSupabaseStatus("error");
        setSupabaseMessage(error.message);
        return;
      }
      setSupabaseStatus("ok");
      setSupabaseMessage("Conexion valida con Supabase.");
    } catch (error) {
      setSupabaseStatus("error");
      setSupabaseMessage(error instanceof Error ? error.message : "Error desconocido.");
    }
  };

  return (
    <section>
      <h2>Checklist de entorno</h2>
      <p>
        Esta pantalla confirma que el esqueleto funciona antes de modelar tablas
        de Access.
      </p>
      <ul className="status-list">
        <li>
          <strong>Frontend (Vite):</strong> OK
        </li>
        <li>
          <strong>Ruteo base:</strong> OK
        </li>
        <li>
          <strong>Supabase:</strong>{" "}
          <span className={`status-chip status-${supabaseStatus}`}>
            {supabaseStatus}
          </span>
        </li>
      </ul>
      <button className="primary-btn" onClick={checkSupabase} type="button">
        Probar conexion Supabase
      </button>
      <p className="status-message">{supabaseMessage}</p>
      <p className="next-step">
        Siguiente: deploy en Render para validar entorno en linea.
      </p>
    </section>
  );
}

export default function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/">
          <SetupChecklist />
        </Route>
        <Route path="/clientes">
          <Placeholder
            title="Clientes"
            description="Registro y consulta de clientes."
          />
        </Route>
        <Route path="/ventas">
          <Placeholder title="Ventas" description="Registro de ventas en MXN." />
        </Route>
        <Route path="/servicios">
          <Placeholder
            title="Servicios"
            description="Seguimiento de peticiones de servicio."
          />
        </Route>
        <Route path="/reportes">
          <Placeholder
            title="Reportes"
            description="Reportes de ventas y solicitudes de servicio."
          />
        </Route>
      </Switch>
    </Layout>
  );
}
