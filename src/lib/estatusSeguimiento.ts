/** Catálogo actual de estatus de seguimiento (operadores / prospectos). */
export const ESTATUS_SEGUIMIENTO_OPCIONES = [
  "Seguimiento",
  "Agendado",
  "En espera de doc",
  "Pendiente de pago",
  "Pagado pero sin doc",
  "Ingresado",
  "No le interesa",
] as const;

const CATALOGO = ESTATUS_SEGUIMIENTO_OPCIONES as readonly string[];

export const ESTATUS_SEGUIMIENTO_DEFECTO = "Seguimiento" as const;

export function esEstatusSeguimientoEnCatalogo(s: string | null | undefined): boolean {
  if (!s?.trim()) return false;
  return CATALOGO.includes(s.trim());
}

/** Ocultar en «solo pendientes» (ex-closed). */
export function esEstatusSeguimientoOcultoPendientes(
  s: string | null | undefined,
): boolean {
  if (!s?.trim()) return false;
  const t = s.trim();
  return (
    t === "No le interesa" ||
    t === "Ingresado" ||
    t === "Cerrada" // legado
  );
}

/** Fila gris en semáforo (sin urgencia por fecha). */
export function esEstatusSeguimientoTerminalSemaforo(
  s: string | null | undefined,
): boolean {
  return esEstatusSeguimientoOcultoPendientes(s);
}
