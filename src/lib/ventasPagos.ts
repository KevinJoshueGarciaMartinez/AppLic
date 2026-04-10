import { supabase } from "./supabase";
import { insertAplicacionSaldoTicket } from "./saldoOperador";
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

  // ── 1. Obtener filas afectadas y sus faltantes actuales ──────────────────
  let filas: { id: number; costo: number; cobro: number; faltante: number }[] = [];

  if (ticketId) {
    const { data, error } = await supabase
      .from("ventas")
      .select("id, costo, cobro, faltante")
      .eq("ticket_id", ticketId)
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    filas = (data ?? []) as typeof filas;
  } else {
    const { data, error } = await supabase
      .from("ventas")
      .select("id, costo, cobro, faltante")
      .eq("id", ventaId!)
      .single();
    if (error) throw new Error(error.message);
    filas = [data as (typeof filas)[0]];
  }

  const totalFaltante = round2(filas.reduce((s, f) => s + Number(f.faltante ?? 0), 0));
  if (monto > totalFaltante + 0.005) {
    throw new Error(
      `El pago ($${monto.toFixed(2)}) supera el faltante pendiente ($${totalFaltante.toFixed(2)}).`,
    );
  }

  // ── 2. Distribuir el pago en cascada sobre los faltantes ─────────────────
  const faltantes = filas.map((f) => Number(f.faltante ?? 0));
  const deltas = distribuirEnFaltantes(faltantes, monto);

  // ── 3. Actualizar cobro de cada fila ─────────────────────────────────────
  for (let i = 0; i < filas.length; i++) {
    const delta = deltas[i] ?? 0;
    if (delta <= 0) continue;
    const fila = filas[i]!;
    const nuevoCobro = round2(Number(fila.cobro) + delta);
    const { error } = await supabase
      .from("ventas")
      .update({ cobro: nuevoCobro })
      .eq("id", fila.id);
    if (error) throw new Error(`Error actualizando cobro de venta ${fila.id}: ${error.message}`);
  }

  // ── 4. Insertar registro en ventas_pagos ─────────────────────────────────
  const pagoRecord: VentaPagoInsert = {
    venta_id: ventaId,
    ticket_id: ticketId,
    fecha,
    monto,
    forma_pago: formaPago,
    pago_efectivo: pagoEfectivo,
    pago_deposito: pagoDeposito,
    pago_saldo: pagoSaldo,
    referencia: referencia?.trim() || null,
    concepto: concepto?.trim() || null,
  };

  const { error: pagoError } = await supabase.from("ventas_pagos").insert(pagoRecord);
  if (pagoError) throw new Error(`Error registrando pago: ${pagoError.message}`);

  // ── 5. Descontar saldo a favor del operador si aplica ────────────────────
  const saldoUsado = round2(pagoSaldo);
  if (saldoUsado > 0.005 && operadorId != null) {
    await insertAplicacionSaldoTicket(operadorId, saldoUsado, {
      ticketId,
      ventaId,
    });
  }
}
