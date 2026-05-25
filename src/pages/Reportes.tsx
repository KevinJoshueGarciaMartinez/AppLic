import { useLocation } from "wouter";

type UserRole = "admin" | "recepcion" | "ventas";

interface ReporteCard {
  label: string;
  icon: string;
  href: string;
  disponible: boolean;
  rolesPermitidos: UserRole[];
}

const REPORTES: ReporteCard[] = [
  {
    label: "Comisiones",
    icon: "📊",
    href: "/reportes/comisiones",
    disponible: true,
    rolesPermitidos: ["admin"],
  },
  {
    label: "Petición de Cursos",
    icon: "📝",
    href: "/reportes/peticion-cursos",
    disponible: true,
    rolesPermitidos: ["admin", "recepcion"],
  },
  {
    label: "Seguimiento Prospectos",
    icon: "📞",
    href: "/reportes/seguimiento-prospectos",
    disponible: true,
    rolesPermitidos: ["admin"],
  },
];

export default function Reportes({ role }: { role: UserRole }) {
  const [, navigate] = useLocation();
  const reportesVisibles = REPORTES.filter((reporte) =>
    reporte.rolesPermitidos.includes(role),
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-icon">📋</span> Reportes
          </h1>
          <p className="page-subtitle">Selecciona el reporte que deseas consultar.</p>
        </div>
      </div>

      <div className="module-grid" style={{ marginTop: "1.5rem" }}>
        {reportesVisibles.map((r) => (
          <button
            key={r.href}
            type="button"
            className="module-card"
            onClick={() => navigate(r.href)}
            style={{
              textAlign: "center",
              cursor: "pointer",
              border: "none",
              background: "inherit",
            }}
          >
            <span className="module-icon">{r.icon}</span>
            <strong>{r.label}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
