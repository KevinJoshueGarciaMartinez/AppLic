import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation, useParams } from "wouter";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import Operadores from "./pages/Operadores";
import OperadorForm from "./pages/OperadorForm";
import Ventas from "./pages/Ventas";
import VentaForm from "./pages/VentaForm";
import Comisiones from "./pages/Comisiones";
import Reportes from "./pages/Reportes";
import PeticionCursos from "./pages/PeticionCursos";
import SeguimientoVentas from "./pages/SeguimientoVentas";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: string;
  description: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "⊞", description: "" },
  {
    href: "/operadores",
    label: "Operadores",
    icon: "👤",
    description:
      "Registro y consulta de operadores. Datos personales, documentos, licencia y curso.",
  },
  {
    href: "/ventas",
    label: "Ventas",
    icon: "💰",
    description:
      "Registro de ventas vinculadas a un operador. Servicio, costo, cobro y forma de pago.",
  },
  {
    href: "/seguimiento",
    label: "Seguimiento",
    icon: "📞",
    description:
      "Prospectos como operadores ligeros: captación, próxima llamada y estatus.",
  },
  {
    href: "/reportes",
    label: "Reportes",
    icon: "📋",
    description:
      "Hub de reportes: traslados, ventas y solicitudes de servicio.",
  },
];

// ─── Layout ──────────────────────────────────────────────────────────────────

function Layout({
  children,
  userEmail,
  onSignOut,
}: {
  children: ReactNode;
  userEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const [location] = useLocation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">AppLic</span>
          <span className="sidebar-subtitle">ERP</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${location === item.href || (item.href !== "/" && location.startsWith(item.href)) ? " nav-link--active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="user-email">{userEmail}</p>
          <button className="ghost-btn" onClick={onSignOut} type="button">
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard() {
  return (
    <div>
      <h2 className="page-title">Dashboard</h2>

      <div className="module-grid">
        {NAV_ITEMS.filter((n) => n.href !== "/").map((item) => (
          <Link key={item.href} href={item.href} className="module-card">
            <span className="module-icon">{item.icon}</span>
            <strong>{item.label}</strong>
            <p>{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Placeholder genérico ────────────────────────────────────────────────────

function Placeholder({ item }: { item: NavItem }) {
  return (
    <div>
      <h2 className="page-title">
        <span>{item.icon}</span> {item.label}
      </h2>
      <section className="placeholder-card">
        <p className="placeholder-desc">{item.description}</p>
        <div className="coming-soon">
          <span>En construccion</span>
          <p>
            Las tablas en Supabase ya estan listas. Esta pantalla se
            implementara en la siguiente etapa.
          </p>
        </div>
      </section>
    </div>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setMessage("Introduce correo y contrasena.");
      return;
    }
    setLoading(true);
    setMessage("Procesando...");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setMessage("Sesion iniciada.");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Usuario creado. Revisa tu correo si pide confirmacion.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Error en autenticacion.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo">
          <strong>AppLic</strong>
          <span>ERP</span>
        </div>
        <h2>{mode === "login" ? "Iniciar sesion" : "Crear cuenta"}</h2>
        <label>
          Correo
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKey}
            type="email"
            placeholder="correo@dominio.com"
            autoFocus
          />
        </label>
        <label>
          Contrasena
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKey}
            type="password"
            placeholder="••••••••"
          />
        </label>
        <button
          className="primary-btn"
          onClick={submit}
          type="button"
          disabled={loading}
        >
          {loading
            ? "Procesando..."
            : mode === "login"
              ? "Entrar"
              : "Crear cuenta"}
        </button>
        <button
          className="link-btn"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          type="button"
        >
          {mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}
        </button>
        {message && <p className="status-message">{message}</p>}
      </section>
    </div>
  );
}

// ─── Wrapper para editar operador (extrae :id de la URL) ─────────────────────

function OperadorEditWrapper() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);
  if (!id || isNaN(numId)) return <div>ID inválido</div>;
  return <OperadorForm id={numId} />;
}

function VentaEditWrapper() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);
  if (!id || isNaN(numId)) return <div>ID inválido</div>;
  return <VentaForm id={numId} />;
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session ?? null);
        setCheckingSession(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (checkingSession) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <Layout
      userEmail={session.user.email ?? "usuario"}
      onSignOut={handleSignOut}
    >
      <Switch>
        <Route path="/">
          <Dashboard />
        </Route>

        {/* ── Operadores ── */}
        <Route path="/operadores">
          <Operadores />
        </Route>
        <Route path="/operadores/nuevo">
          <OperadorForm />
        </Route>
        <Route path="/operadores/:id">
          <OperadorEditWrapper />
        </Route>

        {/* ── Ventas ── */}
        <Route path="/ventas">
          <Ventas />
        </Route>
        <Route path="/ventas/nuevo">
          <VentaForm />
        </Route>
        <Route path="/ventas/:id">
          <VentaEditWrapper />
        </Route>

        <Route path="/seguimiento">
          <SeguimientoVentas />
        </Route>

        {/* ── Reportes ── */}
        <Route path="/reportes">
          <Reportes />
        </Route>
        <Route path="/reportes/comisiones">
          <Comisiones />
        </Route>
        <Route path="/reportes/peticion-cursos">
          <PeticionCursos />
        </Route>

        {/* ── Resto de módulos (placeholders) ── */}
        {NAV_ITEMS.filter(
          (n) =>
            !["/", "/operadores", "/ventas", "/seguimiento", "/reportes"].includes(
              n.href,
            ),
        ).map(
          (item) => (
            <Route key={item.href} path={item.href}>
              <Placeholder item={item} />
            </Route>
          ),
        )}
      </Switch>
    </Layout>
  );
}
