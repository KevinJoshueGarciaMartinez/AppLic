import { useLocation } from "wouter";

interface ReporteCard {
  label: string;
  icon: string;
  href: string;
  disponible: boolean;
}

const REPORTES: ReporteCard[] = [
  { label: "Comisiones", icon: "📊", href: "/reportes/comisiones", disponible: true },
  { label: "Petición de Cursos", icon: "📝", href: "/reportes/peticion-cursos", disponible: true },
  { label: "Seguimiento Prospectos", icon: "📞", href: "/reportes/seguimiento-prospectos", disponible: true },
];

export default function Reportes() {
  const [, navigate] = useLocation();

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
        {REPORTES.map((r) => (
          <button
            key={r.href}
            type="button"
            className="module-card"
            onClick={() => navigate(r.href)}
            style={{ textAlign: "center", cursor: "pointer", border: "none", background: "inherit" }}
          >
            <span className="module-icon">{r.icon}</span>
            <strong>{r.label}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
