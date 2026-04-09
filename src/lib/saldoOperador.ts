import { supabase } from "./supabase";

/** Suma de movimientos de wallet (+ abonos, − aplicaciones). */
export async function fetchSaldoFavorWallet(operadorId: number): Promise<number> {
  const { data, error } = await supabase
    .from("operador_saldo_movimientos")
    .select("importe")
    .eq("operador_id", operadorId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { importe: number }[];
  return rows.reduce((s, r) => s + Number(r.importe ?? 0), 0);
}

/** Suma de faltantes pendientes en todas las ventas del operador. */
export async function fetchSaldoEnContraDeuda(operadorId: number): Promise<number> {
  const { data, error } = await supabase
    .from("ventas")
    .select("faltante")
    .eq("operador_id", operadorId)
    .gt("faltante", 0);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { faltante: number }[];
  return rows.reduce((s, r) => s + Number(r.faltante ?? 0), 0);
}

export interface OperadorSaldoMovimientoRow {
  id: number;
  operador_id: number;
  tipo: string;
  importe: number;
  concepto: string | null;
  venta_id: number | null;
  ticket_id: number | null;
  created_at: string;
}

export async function fetchMovimientosSaldo(
  operadorId: number,
): Promise<OperadorSaldoMovimientoRow[]> {
  const { data, error } = await supabase
    .from("operador_saldo_movimientos")
    .select("id, operador_id, tipo, importe, concepto, venta_id, ticket_id, created_at")
    .eq("operador_id", operadorId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as OperadorSaldoMovimientoRow[];
}

export async function insertAbonoSaldo(
  operadorId: number,
  importe: number,
  concepto: string | null,
): Promise<void> {
  if (importe <= 0) throw new Error("El abono debe ser mayor a cero.");
  const { error } = await supabase.from("operador_saldo_movimientos").insert({
    operador_id: operadorId,
    tipo: "abono",
    importe,
    concepto: concepto?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/** Registra uso de saldo a favor al liquidar (importe en pesos positivos → se guarda negativo). */
export async function insertAplicacionSaldoTicket(
  operadorId: number,
  importePositivo: number,
  opts: { ticketId: number | null; ventaId: number | null },
): Promise<void> {
  if (importePositivo <= 0) return;
  const { error } = await supabase.from("operador_saldo_movimientos").insert({
    operador_id: operadorId,
    tipo: "aplicacion_ticket",
    importe: -importePositivo,
    concepto: "Aplicación a liquidación de ticket",
    ticket_id: opts.ticketId,
    venta_id: opts.ventaId,
  });
  if (error) throw new Error(error.message);
}
