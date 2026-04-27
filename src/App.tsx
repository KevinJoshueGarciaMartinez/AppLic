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
import ReporteSeguimientoProspectos from "./pages/ReporteSeguimientoProspectos";
import SeguimientoVentas from "./pages/SeguimientoVentas";
import ComprobacionTransferencias from "./pages/ComprobacionTransferencias";
import Usuarios from "./pages/Usuarios";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: string;
  description: string;
};

type UserRole = "admin" | "recepcion" | "ventas";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  recepcion: "Recepcion",
  ventas: "Ventas",
};

const ROLE_TABLE = "profiles";

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
    href: "/comprobacion-transferencias",
    label: "Comprobación",
    icon: "🏦",
    description:
      "Revisar depósitos y transferencias contra el banco: pendientes y por fecha.",
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

const SYSTEM_ITEMS: NavItem[] = [
  {
    href: "/usuarios",
    label: "Usuarios",
    icon: "🔐",
    description:
      "Gestionar accesos del sistema: asignar nivel y activar o desactivar usuarios.",
  },
];

const NAV_BY_ROLE: Record<UserRole, string[]> = {
  admin: NAV_ITEMS.map((item) => item.href),
  recepcion: ["/", "/operadores", "/ventas"],
  ventas: ["/", "/seguimiento"],
};

const EXTRA_ROUTE_ACCESS: Record<UserRole, string[]> = {
  admin: [
    "/operadores/nuevo",
    "/operadores/:id",
    "/ventas/nuevo",
    "/ventas/:id",
    "/comprobacion-transferencias",
    "/reportes/comisiones",
    "/reportes/peticion-cursos",
    "/reportes/seguimiento-prospectos",
    "/usuarios",
  ],
  recepcion: ["/operadores/nuevo", "/operadores/:id", "/ventas/nuevo", "/ventas/:id"],
  ventas: [],
};

function getAllowedPaths(role: UserRole): string[] {
  return [...NAV_BY_ROLE[role], ...EXTRA_ROUTE_ACCESS[role]];
}

function hasRoleAccess(role: UserRole, path: string): boolean {
  return getAllowedPaths(role).some((allowedPath) => {
    if (allowedPath === path) return true;
    if (allowedPath.endsWith("/:id")) {
      const prefix = allowedPath.replace("/:id", "/");
      return path.startsWith(prefix);
    }
    return false;
  });
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function Layout({
  children,
  userEmail,
  role,
  onSignOut,
}: {
  children: ReactNode;
  userEmail: string;
  role: UserRole;
  onSignOut: () => Promise<void>;
}) {
  const [location] = useLocation();
  const visibleItems = NAV_ITEMS.filter((item) => hasRoleAccess(role, item.href));
  const visibleSystemItems = SYSTEM_ITEMS.filter((item) =>
    hasRoleAccess(role, item.href),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">AppLic</span>
          <span className="sidebar-subtitle">ERP</span>
        </div>

        <nav className="sidebar-nav">
          {visibleItems.map((item) => (
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
          {visibleSystemItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${location === item.href ? " nav-link--active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              Sistema
            </Link>
          ))}
          <p className="user-email">{userEmail}</p>
          <p className="user-email">{ROLE_LABELS[role]}</p>
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

function Dashboard({ role }: { role: UserRole }) {
  return (
    <div>
      <h2 className="page-title">Dashboard</h2>

      <div className="module-grid">
        {NAV_ITEMS.filter((n) => n.href !== "/" && hasRoleAccess(role, n.href)).map((item) => (
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        setMessage(
          "Si el correo es nuevo, te llegara confirmacion y despues un administrador debe asignarte nivel. Si ya tienes cuenta, usa 'Ya tengo cuenta' u 'Olvide mi contrasena'.",
        );
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

  const recoverPassword = async () => {
    if (!email) {
      setMessage("Captura tu correo para recuperar contrasena.");
      return;
    }
    setLoading(true);
    setMessage("Enviando correo de recuperacion...");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setMessage("Si el correo existe, te enviamos instrucciones para recuperar acceso.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo enviar la recuperacion.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo">
          <strong>AppLic</strong>
          <span>ERP</span>
        </div>
        <h2>{mode === "login" ? "Iniciar sesion" : "Solicitar acceso"}</h2>
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
              : "Registrarme"}
        </button>
        <button
          className="link-btn"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          type="button"
          disabled={loading}
        >
          {mode === "login"
            ? "No tengo cuenta (solicitar acceso)"
            : "Ya tengo cuenta"}
        </button>
        <button
          className="link-btn"
          onClick={recoverPassword}
          type="button"
          disabled={loading}
        >
          Olvide mi contrasena
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

function UnauthorizedScreen() {
  return (
    <div className="placeholder-card">
      <h2 className="page-title">Sin acceso</h2>
      <p className="placeholder-desc">
        No tienes permisos para entrar a este modulo. Si crees que es un error, solicita acceso a un administrador.
      </p>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(false);

  const loadRole = async (userId: string): Promise<UserRole | null> => {
    const { data, error } = await supabase
      .from(ROLE_TABLE)
      .select("rol, activo")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("No se pudo cargar el rol del usuario.", error);
      return null;
    }
    if (!data?.activo) return null;
    if (data.rol === "admin" || data.rol === "recepcion" || data.rol === "ventas") {
      return data.rol;
    }
    return null;
  };

  useEffect(() => {
    let isMounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isMounted) {
          setSession(data.session ?? null);
        }
      })
      .catch((error) => {
        console.error("No se pudo obtener la sesion de Supabase.", error);
        if (isMounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (isMounted) {
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

  useEffect(() => {
    if (!session?.user?.id) {
      setRole(null);
      setCheckingRole(false);
      return;
    }

    setCheckingRole(true);
    loadRole(session.user.id)
      .then((resolvedRole) => {
        setRole(resolvedRole);
      })
      .finally(() => {
        setCheckingRole(false);
      });
  }, [session?.user?.id]);

  if (checkingSession || checkingRole) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (!role) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <h2>Sin rol asignado</h2>
          <p className="status-message">
            Tu usuario no tiene un rol activo. Solicita a un administrador que te asigne uno.
          </p>
          <button className="ghost-btn" onClick={handleSignOut} type="button">
            Cerrar sesion
          </button>
        </section>
      </div>
    );
  }

  return (
    <Layout
      userEmail={session.user.email ?? "usuario"}
      role={role}
      onSignOut={handleSignOut}
    >
      <Switch>
        <Route path="/">
          {hasRoleAccess(role, "/") ? <Dashboard role={role} /> : <UnauthorizedScreen />}
        </Route>

        {/* ── Operadores ── */}
        <Route path="/operadores">
          {hasRoleAccess(role, "/operadores") ? <Operadores /> : <UnauthorizedScreen />}
        </Route>
        <Route path="/operadores/nuevo">
          {hasRoleAccess(role, "/operadores/nuevo") ? <OperadorForm /> : <UnauthorizedScreen />}
        </Route>
        <Route path="/operadores/:id">
          {hasRoleAccess(role, "/operadores/:id") ? <OperadorEditWrapper /> : <UnauthorizedScreen />}
        </Route>

        {/* ── Ventas ── */}
        <Route path="/ventas">
          {hasRoleAccess(role, "/ventas") ? <Ventas /> : <UnauthorizedScreen />}
        </Route>
        <Route path="/ventas/nuevo">
          {hasRoleAccess(role, "/ventas/nuevo") ? <VentaForm /> : <UnauthorizedScreen />}
        </Route>
        <Route path="/ventas/:id">
          {hasRoleAccess(role, "/ventas/:id") ? <VentaEditWrapper /> : <UnauthorizedScreen />}
        </Route>

        <Route path="/comprobacion-transferencias">
          {hasRoleAccess(role, "/comprobacion-transferencias") ? (
            <ComprobacionTransferencias />
          ) : (
            <UnauthorizedScreen />
          )}
        </Route>

        <Route path="/seguimiento">
          {hasRoleAccess(role, "/seguimiento") ? <SeguimientoVentas /> : <UnauthorizedScreen />}
        </Route>

        {/* ── Reportes ── */}
        <Route path="/reportes">
          {hasRoleAccess(role, "/reportes") ? <Reportes /> : <UnauthorizedScreen />}
        </Route>
        <Route path="/reportes/comisiones">
          {hasRoleAccess(role, "/reportes/comisiones") ? <Comisiones /> : <UnauthorizedScreen />}
        </Route>
        <Route path="/reportes/peticion-cursos">
          {hasRoleAccess(role, "/reportes/peticion-cursos") ? (
            <PeticionCursos />
          ) : (
            <UnauthorizedScreen />
          )}
        </Route>
        <Route path="/reportes/seguimiento-prospectos">
          {hasRoleAccess(role, "/reportes/seguimiento-prospectos") ? (
            <ReporteSeguimientoProspectos />
          ) : (
            <UnauthorizedScreen />
          )}
        </Route>

        <Route path="/usuarios">
          {hasRoleAccess(role, "/usuarios") ? <Usuarios /> : <UnauthorizedScreen />}
        </Route>

        {/* ── Resto de módulos (placeholders) ── */}
        {NAV_ITEMS.filter(
          (n) =>
            ![
              "/",
              "/operadores",
              "/ventas",
              "/comprobacion-transferencias",
              "/seguimiento",
              "/reportes",
            ].includes(n.href),
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
