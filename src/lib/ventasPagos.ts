import { supabase } from "./supabase";
import { insertAplicacionSaldoTicket, insertAbonoSaldo } from "./saldoOperador";
import type { VentaPago, VentaPagoInsert } from "./types";

// ── Lectura ───────────────────────────────────────────────────────────────────

/** Pagos registrados para una venta individual (sin ticket). */
export async function fetchPagosDeVenta(ventaId: number): Promise<VentaPago[]> {
  const { data, error } = await supabase
    .from("ventas_pagos")
    .select("*")
    .eq("venta_id", ventaId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VentaPago[];
}

/** Pagos registrados para un ticket (multi-servicio). */
export async function fetchPagosDeTicket(ticketId: number): Promise<VentaPago[]> {
  const { data, error } = await supabase
    .from("ventas_pagos")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VentaPago[];
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Distribuye `montoAdicional` sobre un arreglo de faltantes actuales
 * usando cascada (llena el primero, luego el siguiente, etc.).
 * Devuelve el incremento de cobro para cada línea.
 */
function distribuirEnFaltantes(faltantes: number[], montoAdicional: number): number[] {
  let rest = Math.max(0, montoAdicional);
  return faltantes.map((f) => {
    const delta = Math.min(rest, Math.max(0, f));
    rest = round2(rest - delta);
    return round2(delta);
  });
}

// ── Parámetros de liquidación ─────────────────────────────────────────────────

export interface LiquidacionParams {
  /** ID de la venta (cuando es venta sin ticket). */
  ventaId: number | null;
  /** ID del ticket (cuando agrupa múltiples ventas). */
  ticketId: number | null;
  /** ID del operador (necesario si el pago usa saldo a favor). */
  operadorId: number | null;
  fecha: string;
  monto: number;
  formaPago: VentaPagoInsert["forma_pago"];
  pagoEfectivo: number;
  pagoDeposito: number;
  pagoSaldo: number;
  referencia: string | null;
  concepto: string | null;
}

// ── Mutación principal ────────────────────────────────────────────────────────

/**
 * Registra un pago de liquidación:
 * 1. Inserta un registro en `ventas_pagos`.
 * 2. Actualiza `ventas.cobro` de cada fila afectada (cobro += delta),
 *    lo que corrige automáticamente la columna generada `faltante`.
 * 3. Si el pago usa saldo a favor, descuenta de `operador_saldo_movimientos`.
 */
export async function registrarLiquidacion(params: LiquidacionParams): Promise<void> {
  const {
    ventaId,
    ticketId,
    operadorId,
    fecha,
    monto,
    formaPago,
    pagoEfectivo,
    pagoDeposito,
    pagoSaldo,
    referencia,
    concepto,
  } = params;

  if (monto <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (!ventaId && !ticketId) throw new Error("Se requiere venta_id o ticket_id.");

  // ── 1. Obtener filas afectadas y sus valores actuales ───────────────────
  type FilaVenta = {
    id: number;
    costo: number;
    cobro: number;
    faltante: number;
    pago_efectivo: number;
    pago_deposito: number;
    pago_saldo_operador: number;
  };
  let filas: FilaVenta[] = [];

  const SELECT_COLS = "id, costo, cobro, faltante, pago_efectivo, pago_deposito, pago_saldo_operador";

  if (ticketId) {
    const { data, error } = await supabase
      .from("ventas")
      .select(SELECT_COLS)
      .eq("ticket_id", ticketId)
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    filas = (data ?? []) as FilaVenta[];
  } else {
    const { data, error } = await supabase
      .from("ventas")
      .select(SELECT_COLS)
      .eq("id", ventaId!)
      .single();
    if (error) throw new Error(error.message);
    filas = [data as FilaVenta];
  }

  const totalFaltante = round2(filas.reduce((s, f) => s + Number(f.faltante ?? 0), 0));
  const montoLiquidar = round2(Math.min(monto, totalFaltante));
  const sobrepago = round2(Math.max(0, monto - totalFaltante));
  const ratio = monto > 0 ? montoLiquidar / monto : 0;

  const peLiq = round2(pagoEfectivo * ratio);
  const pdLiq = round2(pagoDeposito * ratio);
  const psLiq = round2(pagoSaldo * ratio);

  // ── 2. Distribuir el pago en cascada sobre los faltantes ─────────────────
  const faltantes = filas.map((f) => Number(f.faltante ?? 0));
  const deltas = distribuirEnFaltantes(faltantes, montoLiquidar);

  // ── 3. Actualizar cobro y desglose acumulado en cada fila ───────────────
  // Los campos pago_efectivo/deposito/saldo_operador en ventas representan
  // el TOTAL acumulado de todos los pagos (inicial + liquidaciones).
  // Para tickets, todas las filas comparten el mismo desglose (nivel ticket),
  // por lo que reciben el mismo delta de desglose.
  for (let i = 0; i < filas.length; i++) {
    const delta = deltas[i] ?? 0;
    const fila = filas[i]!;
    if (delta <= 0 && peLiq === 0 && pdLiq === 0 && psLiq === 0) continue;
    const { error } = await supabase
      .from("ventas")
      .update({
        cobro:               round2(Number(fila.cobro) + delta),
        pago_efectivo:       round2(Number(fila.pago_efectivo       ?? 0) + peLiq),
        pago_deposito:       round2(Number(fila.pago_deposito       ?? 0) + pdLiq),
        pago_saldo_operador: round2(Number(fila.pago_saldo_operador ?? 0) + psLiq),
      })
      .eq("id", fila.id);
    if (error) throw new Error(`Error actualizando venta ${fila.id}: ${error.message}`);
  }

  // ── 4. Insertar registro en ventas_pagos (solo lo que liquida deuda) ─────
  if (montoLiquidar > 0.005) {
    const pagoRecord: VentaPagoInsert = {
      venta_id: ventaId,
      ticket_id: ticketId,
      fecha,
      monto: montoLiquidar,
      forma_pago: formaPago,
      pago_efectivo: peLiq,
      pago_deposito: pdLiq,
      pago_saldo: psLiq,
      referencia: referencia?.trim() || null,
      concepto: concepto?.trim() || null,
    };

    const { error: pagoError } = await supabase.from("ventas_pagos").insert(pagoRecord);
    if (pagoError) throw new Error(`Error registrando pago: ${pagoError.message}`);
  }

  // ── 5. Sobrepago → saldo a favor (abono vinculado al ticket) ─────────────
  if (sobrepago > 0.005) {
    if (operadorId == null) {
      throw new Error(
        "Se requiere un operador en el ticket para registrar el sobrepago como saldo a favor.",
      );
    }
    await insertAbonoSaldo(operadorId, sobrepago, "Sobrepago (liquidación)", {
      ventaId,
      ticketId,
    });
  }

  // ── 6. Descontar saldo a favor del operador (solo parte que liquidó) ────
  const saldoUsado = round2(psLiq);
  if (saldoUsado > 0.005 && operadorId != null) {
    await insertAplicacionSaldoTicket(operadorId, saldoUsado, {
      ticketId,
      ventaId,
    });
  }
}
