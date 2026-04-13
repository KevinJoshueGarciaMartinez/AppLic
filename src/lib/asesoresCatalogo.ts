/** Opciones del campo Asesor (seguimiento / prospectos). */
export const ASESORES_OPCIONES = [
  "AME - VAL",
  "JESSE - VERO",
  "JESSE - RENATA",
  "ADRIAN",
  "ARANZA",
] as const;

const CATALOGO = ASESORES_OPCIONES as readonly string[];

/**
 * Clases CSS para un tono estable por asesor: fijos para el catálogo y hash para texto libre.
 */
export function asesorTonoClass(asesor: string | null | undefined): string {
  const t = asesor?.trim();
  if (!t) return "";
  const i = CATALOGO.indexOf(t);
  if (i >= 0) return `asesor-tono asesor-tono--f${i}`;
  const norm = t.toUpperCase();
  let h = 0;
  for (let c = 0; c < norm.length; c++) {
    h = (h * 31 + norm.charCodeAt(c)) >>> 0;
  }
  return `asesor-tono asesor-tono--x${h % 10}`;
}
