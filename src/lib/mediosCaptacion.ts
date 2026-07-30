/** Opciones de «Medio de captacion» (operadores / prospectos). */
export const MEDIOS_CAPTACION = [
  "CLIENTE",
  "RECOMENDADO",
  "ASIGNADO",
  "REDES SOCIALES",
  "GOOGLE MAPS",
  "JIMMY",
  "LONA",
  "TARJETEO",
] as const;

const CATALOGO = MEDIOS_CAPTACION as readonly string[];

/** Etiqueta en listados; conserva lectura amable de valores previos a migracion 027. */
export function etiquetaMedioCaptacion(m: string | null | undefined): string {
  if (!m?.trim()) return "—";
  if (m === "Telefono") return "Telefono";
  if (m === "Redes") return "Redes sociales";
  return m;
}

export function esMedioCaptacionCatalogoActual(m: string | null | undefined): boolean {
  if (!m?.trim()) return false;
  return CATALOGO.includes(m);
}
