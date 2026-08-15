import { supabase } from "./supabase";
import type { FormaReembolso, Reembolso, ResumenReembolsable } from "./types";

export type VentaOTicket = {
  ventaId: number | null;
  ticketId: number | null;
};

export async function fetchResumenReembolsable({
  ventaId,
  ticketId,
}: VentaOTicket): Promise<ResumenReembolsable> {
  const { data, error } = await supabase
    .rpc("resumen_reembolsable", {
      p_venta_id: ventaId,
      p_ticket_id: ticketId,
    })
    .single();

  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    pagado: Number(row.pagado ?? 0),
    reservado: Number(row.reservado ?? 0),
    procesado: Number(row.procesado ?? 0),
    disponible: Number(row.disponible ?? 0),
    disponible_efectivo: Number(row.disponible_efectivo ?? 0),
    disponible_deposito: Number(row.disponible_deposito ?? 0),
    disponible_saldo: Number(row.disponible_saldo ?? 0),
  };
}

export async function fetchReembolsos({
  ventaId,
  ticketId,
}: VentaOTicket): Promise<Reembolso[]> {
  let query = supabase
    .from("reembolsos")
    .select(
      "id, venta_id, ticket_id, operador_id, tipo, estado, monto, forma_reembolso, reembolso_efectivo, reembolso_deposito, reembolso_saldo, origen_efectivo, origen_deposito, origen_saldo, motivo, referencia, observaciones, solicitado_por, solicitado_at, autorizado_at, procesado_at",
    )
    .order("solicitado_at", { ascending: false });

  query = ticketId != null
    ? query.eq("ticket_id", ticketId)
    : query.eq("venta_id", ventaId!);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as unknown as Reembolso),
    monto: Number(row.monto ?? 0),
    reembolso_efectivo: Number(row.reembolso_efectivo ?? 0),
    reembolso_deposito: Number(row.reembolso_deposito ?? 0),
    reembolso_saldo: Number(row.reembolso_saldo ?? 0),
    origen_efectivo: Number(row.origen_efectivo ?? row.reembolso_efectivo ?? 0),
    origen_deposito: Number(row.origen_deposito ?? row.reembolso_deposito ?? 0),
    origen_saldo: Number(row.origen_saldo ?? row.reembolso_saldo ?? 0),
  }));
}

export interface SolicitudReembolsoParams extends VentaOTicket {
  monto: number;
  formaReembolso: FormaReembolso;
  reembolsoEfectivo: number;
  reembolsoDeposito: number;
  reembolsoSaldo: number;
  motivo: string;
  observaciones: string | null;
  idempotencyKey: string;
}

export async function solicitarReembolso(params: SolicitudReembolsoParams): Promise<number> {
  const { data, error } = await supabase.rpc("solicitar_reembolso", {
    p_venta_id: params.ventaId,
    p_ticket_id: params.ticketId,
    p_monto: params.monto,
    p_forma_reembolso: params.formaReembolso,
    p_reembolso_efectivo: params.reembolsoEfectivo,
    p_reembolso_deposito: params.reembolsoDeposito,
    p_reembolso_saldo: params.reembolsoSaldo,
    p_motivo: params.motivo,
    p_observaciones: params.observaciones,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export type ResumenReembolsoSaldoOperador = {
  saldo: number;
  reservado: number;
  disponible: number;
};

export async function fetchResumenReembolsoSaldoOperador(
  operadorId: number,
): Promise<ResumenReembolsoSaldoOperador> {
  const { data, error } = await supabase
    .rpc("resumen_reembolsable_saldo_operador", { p_operador_id: operadorId })
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    saldo: Number(row.saldo ?? 0),
    reservado: Number(row.reservado ?? 0),
    disponible: Number(row.disponible ?? 0),
  };
}

export interface SolicitudReembolsoSaldoOperadorParams {
  operadorId: number;
  monto: number;
  formaReembolso: FormaReembolso;
  reembolsoEfectivo: number;
  reembolsoDeposito: number;
  motivo: string;
  referencia: string | null;
  observaciones: string | null;
  idempotencyKey: string;
}

export async function solicitarReembolsoSaldoOperador(
  params: SolicitudReembolsoSaldoOperadorParams,
): Promise<number> {
  const { data, error } = await supabase.rpc("solicitar_reembolso_saldo_operador", {
    p_operador_id: params.operadorId,
    p_monto: params.monto,
    p_forma_reembolso: params.formaReembolso,
    p_reembolso_efectivo: params.reembolsoEfectivo,
    p_reembolso_deposito: params.reembolsoDeposito,
    p_motivo: params.motivo,
    p_referencia: params.referencia,
    p_observaciones: params.observaciones,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function resolverReembolso(
  reembolsoId: number,
  autorizar: boolean,
  observaciones: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("resolver_reembolso", {
    p_reembolso_id: reembolsoId,
    p_autorizar: autorizar,
    p_observaciones: observaciones,
  });
  if (error) throw new Error(error.message);
}

export async function procesarReembolso(
  reembolsoId: number,
  formaReembolso: FormaReembolso,
  reembolsoEfectivo: number,
  reembolsoDeposito: number,
  referencia: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("procesar_reembolso", {
    p_reembolso_id: reembolsoId,
    p_forma_reembolso: formaReembolso,
    p_reembolso_efectivo: reembolsoEfectivo,
    p_reembolso_deposito: reembolsoDeposito,
    p_referencia: referencia,
  });
  if (error) throw new Error(error.message);
}

export async function completarEntregaReembolso(
  reembolsoId: number,
  formaReembolso: FormaReembolso,
  reembolsoEfectivo: number,
  reembolsoDeposito: number,
  referencia: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("completar_entrega_reembolso", {
    p_reembolso_id: reembolsoId,
    p_forma_reembolso: formaReembolso,
    p_reembolso_efectivo: reembolsoEfectivo,
    p_reembolso_deposito: reembolsoDeposito,
    p_referencia: referencia,
  });
  if (error) throw new Error(error.message);
}

export async function anularReembolso(reembolsoId: number): Promise<void> {
  const { error } = await supabase.rpc("anular_reembolso", {
    p_reembolso_id: reembolsoId,
  });
  if (error) throw new Error(error.message);
}
