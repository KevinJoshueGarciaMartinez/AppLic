import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import {
  fetchSaldoFavorWallet,
  fetchSaldoEnContraDeuda,
  fetchMovimientosSaldoTicket,
  insertAbonoSaldo,
  insertAplicacionSaldoTicket,
  insertDevolucionCancelacion,
  type OperadorSaldoMovimientoRow,
} from "../lib/saldoOperador";
import {
  fetchPagosDeVenta,
  fetchPagosDeTicket,
  registrarLiquidacion,
} from "../lib/ventasPagos";
import type {
  Venta,
  VentaInsert,
  VentaItem,
  VentaPago,
  FormaPagoLiquidacion,
  Servicio,
  Promotor,
  Operador,
} from "../lib/types";
import HistorialVentasOperador, {
  VENTAS_POR_OPERADOR_QUERY_KEY,
} from "../components/HistorialVentasOperador";

const EPSILON_DEUDA = 0.005;

/** `catalogo_servicios_costos.id_servicio` para IVA (línea de desglose; importe lo define el usuario). */
const ID_SERVICIO_IVA = 57;

function esLineaIva(item: VentaItem): boolean {
  if (item.id_servicio === ID_SERVICIO_IVA) return true;
  return item.servicio?.trim().toUpperCase() === "IVA";
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchVenta(id: number): Promise<Venta> {
  const { data, error } = await supabase
    .from("ventas")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as Venta;
}

async function fetchTicketItems(ticketId: number): Promise<VentaItem[]> {
  const { data, error } = await supabase
    .from("ventas")
    .select(
      "id, id_servicio, servicio, tipo_servicio, costo, costo_promotor, observaciones, cobro, egreso",
    )
    .eq("ticket_id", ticketId)
    .order("id");
  if (error) return [];
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ventaId: row.id as number,
    id_servicio: row.id_servicio as number | null,
    servicio: row.servicio as string,
    tipo_servicio: row.tipo_servicio as number | null,
    costo: Number(row.costo ?? 0),
    com_1: Number(row.costo_promotor ?? 0),
    observaciones: (row.observaciones as string | null) ?? null,
    cobro: Number(row.cobro ?? 0),
    egreso: Number(row.egreso ?? 0),
  }));
}

async function fetchServicios(): Promise<Servicio[]> {
  const { data, error } = await supabase
    .from("catalogo_servicios_costos")
    .select("id_servicio, orden, servicio, tipo_servicio, costo_base, com_1")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Servicio[];
}

async function fetchPromotores(): Promise<Promotor[]> {
  const { data, error } = await supabase
    .from("promotores")
    .select("id_promotor, nombre, nick, orden, columna_servicios")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Promotor[];
}

async function buscarOperadores(texto: string): Promise<Operador[]> {
  if (texto.length < 2) return [];
  const { data, error } = await supabase
    .from("operadores")
    .select(
      "numero_consecutivo, nombre, apellido_paterno, apellido_materno, curp, telefono_1, es_prospecto",
    )
    .eq("es_prospecto", false)
    .or(
      `curp.ilike.%${texto}%,nombre.ilike.%${texto}%,apellido_paterno.ilike.%${texto}%,telefono_1.ilike.%${texto}%`,
    )
    .limit(8);
  if (error) return [];
  return (data ?? []) as unknown as Operador[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseMontoInput(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
}

/** Fecha local YYYY-MM-DD (evita desfase vs UTC de toISOString). */
function hoyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Reparte el cobro total en cascada por línea (mismo criterio que al crear venta). */
function distribuirCobroEnCascada(costos: number[], totalCobro: number): number[] {
  let rest = Math.max(0, totalCobro);
  return costos.map((c) => {
    const x = Math.min(rest, c);
    rest = Math.max(0, rest - x);
    return x;
  });
}

function emptyForm(): VentaInsert {
  return {
    ticket_id: null,
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    operador_id: null,
    operador_nombre: null,
    id_promotor: null,
    promotor: null,
    id_servicio: null,
    servicio: null,
    tipo_servicio: null,
    costo: 0,
    costo_promotor: 0,
    comision_pagada: false,
    cobro: 0,
    egreso: 0,
    forma_pago: "Efectivo",
    pago_efectivo: 0,
    pago_deposito: 0,
    pago_saldo_operador: 0,
    numero_referencia: null,
    observaciones: null,
    fecha_solicitud_curso: hoyLocal(),
    fecha_pago: null,
  };
}

// ── Operador autocomplete ─────────────────────────────────────────────────────

function OperadorSearch({
  operadorId,
  operadorNombre,
  onChange,
  autoFocus,
}: {
  operadorId: number | null;
  operadorNombre: string | null;
  onChange: (id: number, nombre: string) => void;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState(operadorNombre ?? "");
  const [resultados, setResultados] = useState<Operador[]>([]);
  const [abierto, setAbierto] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTexto(operadorNombre ?? "");
  }, [operadorNombre]);

  function handleInput(val: string) {
    setTexto(val);
    if (val === "") {
      setResultados([]);
      setAbierto(false);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await buscarOperadores(val);
      setResultados(res);
      setAbierto(res.length > 0);
    }, 300);
  }

  function seleccionar(op: Operador) {
    const nombre = [op.nombre, op.apellido_paterno, op.apellido_materno]
      .filter(Boolean)
      .join(" ");
    setTexto(nombre);
    setAbierto(false);
    onChange(op.numero_consecutivo, nombre);
  }

  return (
    <div className="autocomplete-wrap">
      <input
        type="text"
        value={texto}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => texto.length >= 2 && setAbierto(resultados.length > 0)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar por nombre, CURP o teléfono..."
        autoFocus={!!autoFocus}
      />
      {abierto && (
        <ul className="autocomplete-list">
          {resultados.map((op) => (
            <li
              key={op.numero_consecutivo}
              className="autocomplete-item"
              onMouseDown={() => seleccionar(op)}
            >
              <span className="autocomplete-nombre">
                {[op.nombre, op.apellido_paterno, op.apellido_materno]
                  .filter(Boolean)
                  .join(" ")}
              </span>
              <span className="autocomplete-curp">
                {op.curp ?? "Sin CURP"}
                {op.es_prospecto ? " · Prospecto" : ""}
                {op.telefono_1 ? ` · ${op.telefono_1}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {operadorId && (
        <span className="field-hint">ID: #{operadorId}</span>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  id?: number;
}

export default function VentaForm({ id }: Props) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const isNew = !id;
  /** En nueva venta: confirmar promotor (cambio o salir del select) antes de habilitar servicios/ticket. */
  const [promotorRevisado, setPromotorRevisado] = useState(false);
  const [form, setForm] = useState<VentaInsert>(emptyForm());
  const [items, setItems] = useState<VentaItem[]>([]);
  const [draftServicioId, setDraftServicioId] = useState<number | "">("");
  const [draftObservaciones, setDraftObservaciones] = useState("");
  const [guardado, setGuardado] = useState(false);

  const emptyLiq = () => ({
    monto: "",
    formaPago: "Efectivo" as FormaPagoLiquidacion,
    pagoEfectivo: "",
    pagoDeposito: "",
    pagoSaldo: "",
    referencia: "",
    concepto: "",
  });
  const [liqForm, setLiqForm] = useState(emptyLiq);

  // ── Cancelación ───────────────────────────────────────────────────────────
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [confirmSobrepago, setConfirmSobrepago] = useState<
    { kind: "venta" | "liq"; amount: number } | null
  >(null);
  const ventaSavePendingRef = useRef<VentaSaveVars | null>(null);

  // Cargar venta existente
  const { isLoading: loadingVenta, data: ventaData } = useQuery({
    queryKey: ["venta", id],
    queryFn: () => fetchVenta(id!),
    enabled: !isNew,
  });

  // Cargar items del ticket (si la venta pertenece a un ticket)
  const ticketId = ventaData?.ticket_id ?? null;
  const { data: itemsData } = useQuery({
    queryKey: ["ticket_items", ticketId],
    queryFn: () => fetchTicketItems(ticketId!),
    enabled: !!ticketId,
  });

  useEffect(() => {
    if (ventaData) {
      const {
        id: _id,
        created_at,
        updated_at,
        comision_promotor,
        faltante,
        total_cobrado,
        promotores,
        catalogo_servicios_costos,
        ticket_id: tid,
        cobro: cobroRow,
        cancelado: _cancelado,
        motivo_cancelacion: _motivo,
        cancelado_at: _cancelado_at,
        ...rest
      } = ventaData;
      const base = rest as VentaInsert;
      base.pago_efectivo = Number(base.pago_efectivo ?? 0);
      base.pago_deposito = Number(base.pago_deposito ?? 0);
      base.pago_saldo_operador = Number(base.pago_saldo_operador ?? 0);
      // En ticket multi-línea el total cobrado se calcula al cargar ítems; no usar cobro de una sola fila.
      if (!tid) {
        base.cobro = cobroRow;
      } else {
        base.cobro = 0;
      }
      setForm(base);
    }
  }, [ventaData]);

  useEffect(() => {
    if (!isNew) return;
    setPromotorRevisado(false);
  }, [form.operador_id, isNew]);

  useEffect(() => {
    if (itemsData && itemsData.length > 0) {
      setItems(itemsData);
      const sumCobro = itemsData.reduce((s, it) => s + Number(it.cobro ?? 0), 0);
      if (!isNew && ventaData?.ticket_id) {
        setForm((prev) => ({ ...prev, cobro: sumCobro }));
      }
      return;
    }
    if (ventaData && !ventaData.ticket_id) {
      setItems([
        {
          ventaId: ventaData.id,
          id_servicio: ventaData.id_servicio,
          servicio: ventaData.servicio ?? "",
          tipo_servicio: ventaData.tipo_servicio,
          costo: ventaData.costo,
          com_1: ventaData.costo_promotor ?? 0,
          observaciones: ventaData.observaciones ?? null,
          cobro: ventaData.cobro,
          egreso: ventaData.egreso,
        },
      ]);
    }
  }, [itemsData, ventaData, isNew]);

  useEffect(() => {
    const totalComision = items.reduce((s, item) => s + item.com_1, 0);
    setForm((prev) =>
      prev.costo_promotor === totalComision
        ? prev
        : { ...prev, costo_promotor: totalComision },
    );
  }, [items]);

  const { data: servicios = [] } = useQuery({
    queryKey: ["servicios"],
    queryFn: fetchServicios,
  });

  const { data: promotores = [] } = useQuery({
    queryKey: ["promotores"],
    queryFn: fetchPromotores,
  });

  const operadorIdSaldo = form.operador_id;
  const {
    data: saldosOperador,
    isError: saldoQueryError,
    error: saldoError,
    isLoading: saldoLoading,
  } = useQuery({
    queryKey: ["operador_saldos", operadorIdSaldo],
    queryFn: async () => {
      if (operadorIdSaldo == null) return { favor: 0, contra: 0 };
      const [favor, contra] = await Promise.all([
        fetchSaldoFavorWallet(operadorIdSaldo),
        fetchSaldoEnContraDeuda(operadorIdSaldo),
      ]);
      return { favor, contra };
    },
    enabled: operadorIdSaldo != null,
  });

  // ── Historial de pagos de esta venta / ticket ─────────────────────────────
  const ticketIdParaPagos = ventaData?.ticket_id ?? null;
  const historialTicketQueryKey = ["historial_ticket", ticketIdParaPagos, id] as const;

  const { data: historialTicketData } = useQuery({
    queryKey: historialTicketQueryKey,
    queryFn: async () => {
      const [pagos, movsSaldo] = await Promise.all([
        ticketIdParaPagos
          ? fetchPagosDeTicket(ticketIdParaPagos)
          : fetchPagosDeVenta(id!),
        fetchMovimientosSaldoTicket(ticketIdParaPagos, ticketIdParaPagos ? null : id!),
      ]);
      return { pagos: pagos as VentaPago[], movsSaldo };
    },
    enabled: !isNew && id != null,
  });

  const historialPagos = historialTicketData?.pagos ?? [];
  const movsSaldoTicket: OperadorSaldoMovimientoRow[] = historialTicketData?.movsSaldo ?? [];

  const lineasHistorialTicket = useMemo(() => {
    type Linea =
      | { kind: "pago"; ts: string; pago: VentaPago }
      | { kind: "saldo"; ts: string; mov: OperadorSaldoMovimientoRow };
    const rows: Linea[] = [];
    for (const p of historialPagos) {
      rows.push({ kind: "pago", ts: p.created_at, pago: p });
    }
    for (const m of movsSaldoTicket) {
      rows.push({ kind: "saldo", ts: m.created_at, mov: m });
    }
    rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return rows;
  }, [historialPagos, movsSaldoTicket]);

  const abonosTicket = useMemo(
    () =>
      movsSaldoTicket.filter(
        (m) => m.tipo === "abono" && Number(m.importe ?? 0) > EPSILON_DEUDA,
      ),
    [movsSaldoTicket],
  );
  const totalAbonosTicket = useMemo(
    () => round2(abonosTicket.reduce((s, m) => s + Number(m.importe ?? 0), 0)),
    [abonosTicket],
  );

  function prepareLiquidacionInput(): {
    monto: number;
    pagoEfectivo: number;
    pagoDeposito: number;
    pagoSaldo: number;
  } {
    const favorWallet = saldosOperador?.favor ?? 0;
    const monto = parseMontoInput(liqForm.monto);
    if (monto <= 0) throw new Error("Indica un monto mayor a cero.");

    let pagoEfectivo = 0;
    let pagoDeposito = 0;
    let pagoSaldo = 0;

    if (liqForm.formaPago === "Dividida") {
      pagoEfectivo = parseMontoInput(liqForm.pagoEfectivo);
      pagoDeposito = parseMontoInput(liqForm.pagoDeposito);
      pagoSaldo = parseMontoInput(liqForm.pagoSaldo);
      const sum = round2(pagoEfectivo + pagoDeposito + pagoSaldo);
      if (Math.abs(sum - monto) > 0.02)
        throw new Error(
          "En pago dividido, la suma de los parciales debe igualar el monto total.",
        );
      if (pagoSaldo > favorWallet + EPSILON_DEUDA)
        throw new Error("Saldo a favor insuficiente para la parte de saldo.");
    } else if (liqForm.formaPago === "Saldo") {
      pagoSaldo = monto;
      if (pagoSaldo > favorWallet + EPSILON_DEUDA)
        throw new Error("Saldo a favor insuficiente.");
    } else if (liqForm.formaPago === "Efectivo") {
      pagoEfectivo = monto;
    } else {
      pagoDeposito = monto;
    }

    return { monto, pagoEfectivo, pagoDeposito, pagoSaldo };
  }

  // ── Mutación de liquidación ───────────────────────────────────────────────
  const liqMutation = useMutation({
    mutationFn: async () => {
      const { monto, pagoEfectivo, pagoDeposito, pagoSaldo } = prepareLiquidacionInput();
      if (monto > faltante + EPSILON_DEUDA) {
        throw new Error(
          "No se permite sobrepago desde esta ventana. Registra solo hasta el faltante del ticket.",
        );
      }

      await registrarLiquidacion({
        ventaId: ticketIdParaPagos ? null : (id ?? null),
        ticketId: ticketIdParaPagos,
        operadorId: form.operador_id,
        fecha: hoyLocal(),
        monto,
        formaPago: liqForm.formaPago,
        pagoEfectivo,
        pagoDeposito,
        pagoSaldo,
        referencia: liqForm.referencia.trim() || null,
        concepto: liqForm.concepto.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venta", id] });
      queryClient.invalidateQueries({ queryKey: historialTicketQueryKey });
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: [VENTAS_POR_OPERADOR_QUERY_KEY] });
      if (ticketIdParaPagos)
        queryClient.invalidateQueries({ queryKey: ["ticket_items", ticketIdParaPagos] });
      queryClient.invalidateQueries({ queryKey: ["operador_saldos", form.operador_id] });
      queryClient.invalidateQueries({ queryKey: ["operador_saldo_movs"] });
      setLiqForm(emptyLiq);
    },
  });

  const esCancelado = ventaData?.cancelado === true;

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!motivoCancelacion.trim()) throw new Error("Indica el motivo de cancelación.");

      const ahora = new Date().toISOString();
      const updateVenta = {
        cancelado: true,
        motivo_cancelacion: motivoCancelacion.trim(),
        cancelado_at: ahora,
      };

      // 1. Cancelar las ventas
      if (ticketIdParaPagos) {
        const { error } = await supabase
          .from("ventas").update(updateVenta).eq("ticket_id", ticketIdParaPagos);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("ventas").update(updateVenta).eq("id", id!);
        if (error) throw new Error(error.message);
      }

      // 2. Obtener pagos del ticket/venta y marcarlos como cancelados
      const { data: pagos, error: pagosErr } = ticketIdParaPagos
        ? await supabase.from("ventas_pagos").select("id, pago_saldo").eq("ticket_id", ticketIdParaPagos)
        : await supabase.from("ventas_pagos").select("id, pago_saldo").eq("venta_id", id!);
      if (pagosErr) throw new Error(pagosErr.message);

      if (pagos && pagos.length > 0) {
        const ids = pagos.map((p: { id: number }) => p.id);
        const { error: markErr } = await supabase
          .from("ventas_pagos").update({ cancelado: true }).in("id", ids);
        if (markErr) throw new Error(markErr.message);

        // 3. Devolver saldo a favor si se usó en algún pago
        const totalSaldoUsado = pagos.reduce(
          (s: number, p: { pago_saldo: number }) => s + Number(p.pago_saldo ?? 0), 0,
        );
        if (totalSaldoUsado > 0.005 && form.operador_id != null) {
          await insertDevolucionCancelacion(form.operador_id, totalSaldoUsado, {
            ticketId: ticketIdParaPagos,
            ventaId: ticketIdParaPagos ? null : (id ?? null),
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venta", id] });
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: historialTicketQueryKey });
      queryClient.invalidateQueries({ queryKey: [VENTAS_POR_OPERADOR_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["operador_saldos", form.operador_id] });
      queryClient.invalidateQueries({ queryKey: ["operador_saldo_movs"] });
      setShowCancelModal(false);
      setMotivoCancelacion("");
    },
  });

  const saldoFavor = saldosOperador?.favor ?? 0;
  const saldoContra = saldosOperador?.contra ?? 0;
  const bloquearNuevaVentaPorDeuda =
    isNew && operadorIdSaldo != null && saldoContra > EPSILON_DEUDA;

  // ── Items handlers ────────────────────────────────────────────────────────

  function addLineFromDraft() {
    if (!isNew) {
      alert("En edición no se agregan líneas al ticket. Crea una venta nueva para otro servicio.");
      return;
    }
    if (draftServicioId === "") {
      alert("Selecciona un servicio para agregarlo al ticket.");
      return;
    }
    const srv = servicios.find((s) => s.id_servicio === Number(draftServicioId));
    if (!srv) return;
    const obs = draftObservaciones.trim() === "" ? null : draftObservaciones.trim();
    setItems((prev) => [
      ...prev,
      {
        id_servicio: srv.id_servicio,
        servicio: srv.servicio,
        tipo_servicio: srv.tipo_servicio,
        costo: srv.costo_base,
        com_1: srv.com_1,
        observaciones: obs,
      },
    ]);
    setDraftServicioId("");
    setDraftObservaciones("");
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItemServicio(idx: number, idServicio: number | null) {
    const srv = servicios.find((s) => s.id_servicio === idServicio);
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              id_servicio: srv?.id_servicio ?? null,
              servicio: srv?.servicio ?? "",
              tipo_servicio: srv?.tipo_servicio ?? null,
              costo: srv?.costo_base ?? 0,
              com_1: srv?.com_1 ?? 0,
            }
          : item,
      ),
    );
  }

  function updateItemCostoIva(idx: number, valueStr: string) {
    setItems((prev) => {
      const cur = prev[idx];
      if (!cur || !esLineaIva(cur)) return prev;
      const parsed = Number(valueStr.replace(",", "."));
      const costo =
        Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
      return prev.map((item, i) => (i === idx ? { ...item, costo } : item));
    });
  }

  // ── Mutation ─────────────────────────────────────────────────────────────

  type VentaSaveVars = { payload: VentaInsert; aplicarSaldo: number };

  const mutation = useMutation({
    mutationFn: async ({ payload, aplicarSaldo }: VentaSaveVars) => {
      const validItems = items.filter((i) => i.servicio);
      if (validItems.length === 0) throw new Error("Agrega al menos un servicio.");

      const operadorId = payload.operador_id;
      if (aplicarSaldo > EPSILON_DEUDA && operadorId == null) {
        throw new Error("Selecciona un operador para aplicar saldo a favor o saldo operador en pago dividido.");
      }

      const totalCobro = Math.max(0, Number(payload.cobro ?? 0));
      const totalItemsCalc = validItems.reduce((s, i) => s + i.costo, 0);
      const cobroEfectivo = round2(Math.min(totalCobro, totalItemsCalc));
      const ratioPago =
        totalCobro > EPSILON_DEUDA ? Math.min(1, cobroEfectivo / totalCobro) : 0;
      const sobrepagoInicial = round2(Math.max(0, totalCobro - cobroEfectivo));

      const costos = validItems.map((i) => i.costo);
      const cobrosLinea = distribuirCobroEnCascada(costos, cobroEfectivo);

      const isMulti = validItems.length > 1;
      const ticketIdEdit = ventaData?.ticket_id ?? null;

      let peTicket = 0;
      let pdTicket = 0;
      let psTicket = 0;
      if (payload.forma_pago === "Dividida") {
        peTicket = round2(Number(payload.pago_efectivo ?? 0) * ratioPago);
        pdTicket = round2(Number(payload.pago_deposito ?? 0) * ratioPago);
        psTicket = round2(Number(payload.pago_saldo_operador ?? 0) * ratioPago);
      } else if (payload.forma_pago === "Efectivo") {
        peTicket = cobroEfectivo;
      } else if (payload.forma_pago === "Deposito") {
        pdTicket = cobroEfectivo;
      } else if (payload.forma_pago === "Saldo") {
        psTicket = cobroEfectivo;
      }

      if (isNew) {
        let ticketId: number | null = null;

        if (isMulti) {
          const { data: ticketData, error: ticketErr } = await supabase
            .from("tickets")
            .insert({ fecha: payload.fecha ?? new Date().toISOString().slice(0, 10) })
            .select("id")
            .single();
          if (ticketErr) throw new Error(ticketErr.message);
          ticketId = (ticketData as { id: number }).id;
        }

        const ventasPayload = validItems.map((item, idx) => ({
          ...payload,
          ticket_id: ticketId,
          id_servicio: item.id_servicio,
          servicio: item.servicio,
          tipo_servicio: item.tipo_servicio,
          costo: item.costo,
          costo_promotor: item.com_1,
          cobro: cobrosLinea[idx] ?? 0,
          egreso: idx === 0 ? (payload.egreso ?? 0) : 0,
          observaciones: item.observaciones?.trim() || null,
          pago_efectivo: peTicket,
          pago_deposito: pdTicket,
          pago_saldo_operador: psTicket,
        }));

        const { data: inserted, error } = await supabase
          .from("ventas")
          .insert(ventasPayload)
          .select("id");
        if (error) throw new Error(error.message);

        const firstId = (inserted as { id: number }[] | null)?.[0]?.id ?? null;

        // Registrar pago inicial en ventas_pagos (solo lo que aplica al ticket)
        if (cobroEfectivo > EPSILON_DEUDA) {
          const { error: pagoErr } = await supabase.from("ventas_pagos").insert({
            venta_id:      ticketId ? null : firstId,
            ticket_id:     ticketId,
            fecha:         payload.fecha ?? new Date().toISOString().slice(0, 10),
            monto:         cobroEfectivo,
            forma_pago:    payload.forma_pago,
            pago_efectivo: peTicket,
            pago_deposito: pdTicket,
            pago_saldo:    psTicket,
            referencia:    payload.numero_referencia ?? null,
            concepto:      "Pago inicial",
          });
          if (pagoErr) throw new Error(`Error al registrar pago inicial: ${pagoErr.message}`);
        }

        if (aplicarSaldo > EPSILON_DEUDA && operadorId != null) {
          await insertAplicacionSaldoTicket(operadorId, aplicarSaldo, {
            ticketId,
            ventaId: firstId,
          });
        }

        if (sobrepagoInicial > EPSILON_DEUDA) {
          if (operadorId == null) {
            throw new Error(
              "Selecciona un operador para registrar el sobrepago como saldo a favor.",
            );
          }
          await insertAbonoSaldo(operadorId, sobrepagoInicial, "Sobrepago (pago inicial)", {
            ventaId: firstId,
            ticketId,
          });
        }
      } else {
        if (ticketIdEdit && validItems.some((it) => !it.ventaId)) {
          throw new Error(
            "Este ticket tiene líneas sin id. Recarga la página; no se pueden agregar servicios en edición.",
          );
        }

        const sorted = ticketIdEdit
          ? [...validItems].sort((a, b) => (a.ventaId ?? 0) - (b.ventaId ?? 0))
          : validItems;

        const cobrosSorted = ticketIdEdit
          ? distribuirCobroEnCascada(
              sorted.map((i) => i.costo),
              totalCobro,
            )
          : cobrosLinea;

        for (let idx = 0; idx < sorted.length; idx++) {
          const item = sorted[idx]!;
          const vid = item.ventaId ?? id!;
          const ventaPayload: VentaInsert = {
            ...payload,
            id_servicio: item.id_servicio,
            servicio: item.servicio,
            tipo_servicio: item.tipo_servicio,
            costo: item.costo,
            costo_promotor: item.com_1,
            cobro: cobrosSorted[idx] ?? 0,
            egreso: idx === 0 ? (payload.egreso ?? 0) : 0,
            observaciones: item.observaciones?.trim() || null,
          };
          const { error } = await supabase.from("ventas").update(ventaPayload).eq("id", vid);
          if (error) throw new Error(error.message);
        }

        // No aplicar saldo a favor aquí: en creación ya se registró; en edición los cobros extra van por liquidación.
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_items"] });
      if (id != null) queryClient.invalidateQueries({ queryKey: ["venta", id] });
      queryClient.invalidateQueries({ queryKey: historialTicketQueryKey });
      queryClient.invalidateQueries({ queryKey: [VENTAS_POR_OPERADOR_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["operador_saldos"] });
      queryClient.invalidateQueries({ queryKey: ["operador_saldo_movs"] });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
      if (isNew) navigate("/ventas");
    },
  });

  function set<K extends keyof VentaInsert>(key: K, value: VentaInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setFormaPago(val: VentaInsert["forma_pago"]) {
    setForm((prev) => {
      if (val === "Dividida") {
        const sum = round2(prev.pago_efectivo + prev.pago_deposito + prev.pago_saldo_operador);
        return { ...prev, forma_pago: val, cobro: sum > 0 ? sum : prev.cobro };
      }
      // Al cambiar a cualquier otra forma, limpiar desglose
      return { ...prev, forma_pago: val, pago_efectivo: 0, pago_deposito: 0, pago_saldo_operador: 0 };
    });
  }

  function updatePagoDividida(
    key: "pago_efectivo" | "pago_deposito" | "pago_saldo_operador",
    raw: string,
  ) {
    const v = parseMontoInput(raw);
    setForm((prev) => {
      if (prev.forma_pago !== "Dividida") return prev;
      const next = { ...prev, [key]: v };
      const sum = round2(next.pago_efectivo + next.pago_deposito + next.pago_saldo_operador);
      return { ...next, cobro: sum };
    });
  }

  function handlePromotorChange(idPromotor: number) {
    const p = promotores.find((x) => x.id_promotor === idPromotor);
    setForm((prev) => ({
      ...prev,
      id_promotor: idPromotor,
      promotor: p?.nombre ?? null,
    }));
  }

  const totalItems = items.reduce((s, item) => s + item.costo, 0);
  const tieneCurso = items.some((item) => item.tipo_servicio === 2);
  const faltante = totalItems - form.cobro;

  // Con curso en el ticket: nueva venta → fecha solicitud = hoy (sin date picker). Edición → conservar fecha guardada; si falta, usar hoy.
  useEffect(() => {
    if (!tieneCurso) return;
    const hoy = hoyLocal();
    if (isNew) {
      setForm((prev) =>
        prev.fecha_solicitud_curso === hoy
          ? prev
          : { ...prev, fecha_solicitud_curso: hoy },
      );
      return;
    }
    setForm((prev) => {
      if (prev.fecha_solicitud_curso) return prev;
      return { ...prev, fecha_solicitud_curso: hoy };
    });
  }, [tieneCurso, isNew]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isNew) return;
    if (!form.operador_id) {
      alert("Selecciona un operador antes de guardar.");
      return;
    }
    if (isNew && saldoContra > EPSILON_DEUDA) {
      alert(
        "Este operador tiene saldo en contra (ventas con faltante pendiente). Liquida esa deuda antes de registrar una venta nueva.",
      );
      return;
    }
    if (!form.id_promotor) {
      alert("Selecciona un promotor antes de guardar.");
      return;
    }
    if (!Number.isFinite(form.cobro)) {
      alert("Indica un total cobrado válido.");
      return;
    }
    if (form.cobro < 0) {
      alert("El cobro no puede ser negativo.");
      return;
    }

    /** En edición el cobro y la forma de pago ya están fijados; los pagos nuevos van por «Registrar pago». */
    let aplicarSaldo = 0;
    if (isNew) {
      const cobroEfectivoTicket = round2(Math.min(form.cobro, totalItems));
      const ratioCobro =
        form.cobro > EPSILON_DEUDA ? Math.min(1, cobroEfectivoTicket / form.cobro) : 0;

      if (form.forma_pago === "Dividida") {
        const sum = round2(form.pago_efectivo + form.pago_deposito + form.pago_saldo_operador);
        if (Math.abs(form.cobro - sum) > 0.02) {
          alert("En pago dividido, el total cobrado debe ser la suma de efectivo, depósito y saldo operador.");
          return;
        }
        aplicarSaldo = round2(form.pago_saldo_operador * ratioCobro);
        if (form.pago_saldo_operador > EPSILON_DEUDA && aplicarSaldo > saldoFavor + EPSILON_DEUDA) {
          alert("Saldo a favor insuficiente para el monto indicado en saldo operador.");
          return;
        }
      } else if (form.forma_pago === "Saldo") {
        aplicarSaldo = cobroEfectivoTicket;
        if (form.cobro > EPSILON_DEUDA && aplicarSaldo > saldoFavor + EPSILON_DEUDA) {
          alert(`Saldo a favor insuficiente. Disponible: $${saldoFavor.toFixed(2)}`);
          return;
        }
      }

      const sobrepagoEnNuevaVenta = round2(Math.max(0, form.cobro - totalItems));
      if (sobrepagoEnNuevaVenta > EPSILON_DEUDA) {
        if (form.operador_id == null) {
          alert(
            "Selecciona un operador para registrar el sobrepago como saldo a favor.",
          );
          return;
        }
        ventaSavePendingRef.current = { payload: form, aplicarSaldo };
        setConfirmSobrepago({ kind: "venta", amount: sobrepagoEnNuevaVenta });
        return;
      }
    }

    mutation.mutate({ payload: form, aplicarSaldo });
  }

  function dismissConfirmSobrepago() {
    ventaSavePendingRef.current = null;
    setConfirmSobrepago(null);
  }

  function confirmSobrepagoAndSave() {
    if (!confirmSobrepago) return;
    if (confirmSobrepago.kind === "venta") {
      const pending = ventaSavePendingRef.current;
      ventaSavePendingRef.current = null;
      setConfirmSobrepago(null);
      if (pending) mutation.mutate(pending);
      return;
    }
    setConfirmSobrepago(null);
    liqMutation.mutate();
  }

  function handleRegistrarLiquidacionClick() {
    let prep: ReturnType<typeof prepareLiquidacionInput>;
    try {
      prep = prepareLiquidacionInput();
    } catch (err) {
      alert((err as Error).message);
      return;
    }
    const sobr = round2(Math.max(0, prep.monto - faltante));
    if (sobr > EPSILON_DEUDA) {
      setConfirmSobrepago({ kind: "liq", amount: sobr });
      return;
    }
    liqMutation.mutate();
  }

  if (!isNew && loadingVenta) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner" />
          <span>Cargando venta...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="btn-back" onClick={() => navigate("/ventas")}>
            ← Volver a Ventas
          </button>
          <h1 className="page-title">
            <span className="page-icon">💰</span>
            {isNew ? "Nueva Venta" : `Venta #${id}`}
          </h1>
        </div>
      </div>

      {esCancelado && (
        <div className="cancelado-banner">
          <span className="cancelado-banner__titulo">⛔ TICKET CANCELADO</span>
          <span className="cancelado-banner__motivo">
            Motivo: {ventaData?.motivo_cancelacion ?? "—"}
          </span>
          {ventaData?.cancelado_at && (
            <span className="cancelado-banner__fecha">
              {new Date(ventaData.cancelado_at).toLocaleString("es-MX")}
            </span>
          )}
        </div>
      )}

      {mutation.isError && (
        <div className="alert-error">
          Error al guardar: {(mutation.error as Error).message}
        </div>
      )}
      {guardado && (
        <div className="alert-success">Venta guardada correctamente.</div>
      )}

      <form onSubmit={handleSubmit} className="record-form">
        <div className="form-grid-ventas">
          {/* ── Izquierda: operador y promotor (espacio reservado debajo para más secciones) ── */}
          <div>
            <div className="form-group-title">Operador</div>
            <div className="venta-operador-bloque">
              <div className="venta-operador-busqueda">
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label>Buscar operador *</label>
                  {isNew ? (
                    <OperadorSearch
                      operadorId={form.operador_id}
                      operadorNombre={form.operador_nombre}
                      autoFocus={isNew}
                      onChange={(opId, nombre) =>
                        setForm((prev) => ({ ...prev, operador_id: opId, operador_nombre: nombre }))
                      }
                    />
                  ) : (
                    <div className="campo-financiero-bloqueado">
                      <span className="venta-total-cobro-readonly operador-readonly-name">
                        {form.operador_nombre ?? "—"}
                      </span>
                      {form.operador_id != null && (
                        <span className="field-hint">ID: #{form.operador_id}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {form.operador_id != null && (
                <div className="venta-saldos-cards" aria-live="polite">
                  <div className="saldo-mini-card saldo-mini-card--favor">
                    <span className="saldo-mini-card__titulo">Saldo a favor</span>
                    <span className="saldo-mini-card__monto">
                      {saldoLoading ? "…" : fmt(saldoFavor)}
                    </span>
                    <span className="saldo-mini-card__hint">Abonos registrados</span>
                  </div>
                  <div className="saldo-mini-card saldo-mini-card--contra">
                    <span className="saldo-mini-card__titulo">Saldo en contra</span>
                    <span className="saldo-mini-card__monto">
                      {saldoLoading ? "…" : fmt(saldoContra)}
                    </span>
                    <span className="saldo-mini-card__hint">Suma de faltantes en ventas</span>
                  </div>
                </div>
              )}
            </div>
            {saldoQueryError && form.operador_id != null && (
              <p className="field-hint" style={{ color: "#b91c1c" }}>
                No se pudieron cargar los saldos: {(saldoError as Error).message}
              </p>
            )}
            {bloquearNuevaVentaPorDeuda && (
              <div className="alert-error" style={{ marginTop: "10px" }}>
                No puedes registrar una venta nueva mientras el operador tenga saldo en contra.
                Liquida primero los faltantes pendientes.
              </div>
            )}
            <div className="form-field" style={{ marginTop: "1.25rem" }}>
              <label>Promotor *</label>
              {isNew ? (
                <select
                  className="select-promotor-wide"
                  disabled={isNew && form.operador_id == null}
                  value={form.id_promotor ?? ""}
                  onBlur={() => {
                    if (isNew && form.operador_id != null) setPromotorRevisado(true);
                  }}
                  onChange={(e) => {
                    if (isNew && form.operador_id != null) setPromotorRevisado(true);
                    if (e.target.value) {
                      handlePromotorChange(Number(e.target.value));
                    } else {
                      setForm((prev) => ({
                        ...prev,
                        id_promotor: null,
                        promotor: null,
                      }));
                    }
                  }}
                >
                  <option value="">— Sin promotor —</option>
                  {promotores.map((p) => (
                    <option key={p.id_promotor} value={p.id_promotor}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="campo-financiero-bloqueado">
                  <span className="venta-total-cobro-readonly">{form.promotor ?? "— Sin promotor —"}</span>
                </div>
              )}
            </div>
            {isNew && form.operador_id != null && !promotorRevisado && (
              <p className="field-hint" style={{ marginTop: "10px" }}>
                Elige una opción en «Promotor» (o deja «Sin promotor») y sal del campo (Tab o clic fuera)
                para habilitar servicios y ticket.
              </p>
            )}

            {form.operador_id != null && (
              <HistorialVentasOperador operadorId={form.operador_id} compact />
            )}
          </div>

          {/* ── Derecha: alta de servicios (nueva venta), ticket y cobro ── */}
          <div>
            <fieldset
              className="venta-flujo-bloque"
              disabled={
                isNew &&
                (form.operador_id == null || !promotorRevisado)
              }
            >
            {isNew && (
              <div className="venta-add-service-bar venta-add-service-bar--above-ticket">
                <div className="form-group-title" style={{ marginBottom: "8px" }}>
                  Servicios
                </div>
                <div className="venta-add-service-inner">
                  <select
                    className="venta-draft-servicio"
                    value={draftServicioId === "" ? "" : String(draftServicioId)}
                    onChange={(e) =>
                      setDraftServicioId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  >
                    <option value="">— Seleccionar servicio —</option>
                    {servicios.map((s) => (
                      <option key={s.id_servicio} value={s.id_servicio}>
                        {s.servicio}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="venta-draft-obs"
                    placeholder="Nota del servicio (opcional, solo BD)"
                    value={draftObservaciones}
                    onChange={(e) => setDraftObservaciones(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary venta-btn-add-line"
                    onClick={addLineFromDraft}
                  >
                    + Agregar servicio
                  </button>
                </div>
              </div>
            )}

            <div className="cobro-card">
              <div className="form-group-title">Ticket</div>

              {items.length === 0 ? (
                <p className="ticket-empty-hint">
                  Usa «Servicios» arriba para agregar líneas al ticket.
                </p>
              ) : (
                <div className="ticket-desglose-wrap">
                  <table className="ticket-desglose-table">
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th className="col-monto">Importe</th>
                        {isNew && <th className="col-acc" aria-label="Quitar" />}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            {!isNew ? (
                              <span className="ticket-line-servicio-readonly">
                                {item.servicio || "—"}
                              </span>
                            ) : (
                              <select
                                className="ticket-line-servicio"
                                value={item.id_servicio ?? ""}
                                onChange={(e) =>
                                  updateItemServicio(
                                    idx,
                                    e.target.value ? Number(e.target.value) : null,
                                  )
                                }
                                title="Cambiar servicio"
                              >
                                <option value="">— Servicio —</option>
                                {servicios.map((s) => (
                                  <option key={s.id_servicio} value={s.id_servicio}>
                                    {s.servicio}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="col-monto">
                            {esLineaIva(item) && isNew ? (
                              <input
                                type="number"
                                className="ticket-line-importe-iva"
                                min={0}
                                step={0.01}
                                value={item.costo}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateItemCostoIva(idx, e.target.value)}
                                title="Importe de IVA (lo ingresa el usuario)"
                                aria-label={`Importe IVA, ${item.servicio}`}
                              />
                            ) : (
                              fmt(item.costo)
                            )}
                          </td>
                          {isNew && (
                            <td className="col-acc">
                              <button
                                type="button"
                                className="btn-remove-item"
                                onClick={() => removeItem(idx)}
                                title="Quitar del ticket"
                              >
                                ×
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="calc-row" style={{ marginBottom: "1rem" }}>
                <span>Total servicios</span>
                <span style={{ fontWeight: 600 }}>{fmt(totalItems)}</span>
              </div>

              <hr className="divider" />

              <div className="form-field">
                <label>Forma de pago</label>
                {!isNew ? (
                  <div className="campo-financiero-bloqueado">
                    <span className={`badge ${
                      form.forma_pago === "Efectivo" ? "badge--gray"
                      : form.forma_pago === "Dividida" ? "badge--amber"
                      : form.forma_pago === "Saldo" ? "badge--green"
                      : "badge--blue"
                    }`}>
                      {form.forma_pago === "Saldo" ? "Saldo a favor" : form.forma_pago}
                    </span>
                  </div>
                ) : (
                  <select
                    value={form.forma_pago}
                    onChange={(e) =>
                      setFormaPago(e.target.value as VentaInsert["forma_pago"])
                    }
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Deposito">Depósito</option>
                    <option value="Saldo">Saldo a favor</option>
                    <option value="Dividida">Dividida</option>
                  </select>
                )}
              </div>

              {form.forma_pago === "Dividida" && isNew && (
                <div className="venta-pago-dividido">
                  <div className="form-field">
                    <label>Efectivo (MXN)</label>
                    <input
                      type="number"
                      className="venta-pago-dividido-input"
                      min={0}
                      step={0.01}
                      value={form.pago_efectivo}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updatePagoDividida("pago_efectivo", e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Depósito (MXN)</label>
                    <input
                      type="number"
                      className="venta-pago-dividido-input"
                      min={0}
                      step={0.01}
                      value={form.pago_deposito}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updatePagoDividida("pago_deposito", e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Referencia (depósito)</label>
                    <input
                      type="text"
                      className="venta-pago-dividido-input"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="Ej. folio, transferencia, CLABE…"
                      value={form.numero_referencia ?? ""}
                      onChange={(e) =>
                        set(
                          "numero_referencia",
                          e.target.value.trim() === "" ? null : e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label>Saldo operador (MXN)</label>
                    <input
                      type="number"
                      className="venta-pago-dividido-input"
                      min={0}
                      step={0.01}
                      value={form.pago_saldo_operador}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updatePagoDividida("pago_saldo_operador", e.target.value)}
                      title="Parte del pago cubierta con saldo a favor del operador"
                    />
                    {form.operador_id != null && saldoFavor > EPSILON_DEUDA && (
                      <span className="field-hint">
                        Disponible a favor: {fmt(saldoFavor)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Desglose readonly al editar */}
              {!isNew && form.forma_pago === "Dividida" && (
                <div className="desglose-readonly">
                  <div className="desglose-readonly__fila">
                    <span>Efectivo</span>
                    <span>{fmt(form.pago_efectivo)}</span>
                  </div>
                  <div className="desglose-readonly__fila">
                    <span>Depósito</span>
                    <span>{fmt(form.pago_deposito)}</span>
                  </div>
                  {form.numero_referencia && (
                    <div className="desglose-readonly__fila desglose-readonly__ref">
                      <span>Referencia</span>
                      <span>{form.numero_referencia}</span>
                    </div>
                  )}
                  <div className="desglose-readonly__fila">
                    <span>Saldo operador</span>
                    <span>{fmt(form.pago_saldo_operador)}</span>
                  </div>
                </div>
              )}

              {form.forma_pago === "Deposito" && isNew && (
                <div className="form-field">
                  <label>Referencia</label>
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    placeholder="Ej. folio, transferencia, CLABE…"
                    value={form.numero_referencia ?? ""}
                    onChange={(e) =>
                      set(
                        "numero_referencia",
                        e.target.value.trim() === "" ? null : e.target.value,
                      )
                    }
                  />
                </div>
              )}

              {/* Referencia readonly al editar con depósito */}
              {!isNew && form.forma_pago === "Deposito" && form.numero_referencia && (
                <div className="desglose-readonly">
                  <div className="desglose-readonly__fila desglose-readonly__ref">
                    <span>Referencia</span>
                    <span>{form.numero_referencia}</span>
                  </div>
                </div>
              )}

              <hr className="divider" />

              <div className="form-field">
                <label>Total cobrado (MXN)</label>
                {!isNew ? (
                  <>
                    <div className="venta-total-cobro-readonly">{fmt(form.cobro)}</div>
                  </>
                ) : form.forma_pago === "Dividida" ? (
                  <>
                    <div className="venta-total-cobro-readonly">{fmt(form.cobro)}</div>
                    <span className="field-hint">
                      Suma automática de efectivo, depósito y saldo operador.
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.cobro}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => set("cobro", Number(e.target.value))}
                      title="Suma aplicada al ticket (efectivo, depósito y/o saldo a favor)"
                      required
                    />
                    <span className="field-hint">
                      Incluye lo recibido del cliente. Si excede el total de servicios, antes de guardar
                      se confirmará el saldo a favor para el operador.
                    </span>
                  </>
                )}
              </div>

              {isNew && form.forma_pago === "Saldo" && form.operador_id != null && (
                <p className="field-hint" style={{ marginTop: "2px" }}>
                  Saldo disponible: {saldoLoading ? "…" : fmt(saldoFavor)}
                </p>
              )}

              <div className="calc-row">
                <span>Faltante</span>
                <span className={faltante > 0 ? "calc-red" : "calc-green"}>
                  {fmt(faltante)}
                </span>
              </div>

              {!isNew && abonosTicket.length > 0 && (
                <div className="desglose-readonly" style={{ marginTop: "10px" }}>
                  <div className="desglose-readonly__fila">
                    <span>Abono(s) saldo a favor vinculados</span>
                    <span>{fmt(totalAbonosTicket)}</span>
                  </div>
                  {abonosTicket.map((mov) => (
                    <div key={mov.id} className="desglose-readonly__fila desglose-readonly__ref">
                      <span>{mov.concepto?.trim() || "Abono a favor"}</span>
                      <span>
                        {fmt(Number(mov.importe ?? 0))} · {mov.created_at.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </fieldset>
          </div>
        </div>

        {/* ── Historial de pagos + Liquidación (solo al editar) ── */}
        {!isNew && (
          <div className="liquidacion-section">

            {/* Historial unificado: pagos + saldo a favor / devoluciones */}
            {lineasHistorialTicket.length > 0 && (
              <div className="liquidacion-historial">
                <div className="form-group-title">Movimientos del ticket</div>
                <p className="field-hint" style={{ marginBottom: "10px" }}>
                  Pagos registrados, abonos a favor, sobrepagos y devoluciones vinculados a este ticket.
                </p>
                <table className="data-table liquidacion-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Origen</th>
                      <th>Detalle</th>
                      <th>Referencia</th>
                      <th className="col-money">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasHistorialTicket.map((linea) =>
                      linea.kind === "pago" ? (
                        <tr key={`pago-${linea.pago.id}`} className={linea.pago.cancelado ? "fila-cancelada" : ""}>
                          <td>{linea.pago.fecha}</td>
                          <td>
                            <span className="badge badge--blue">Pago</span>
                            {linea.pago.cancelado && (
                              <span className="badge badge--cancelado" style={{ marginLeft: "6px" }}>
                                Anulado
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                linea.pago.forma_pago === "Efectivo"
                                  ? "badge--gray"
                                  : linea.pago.forma_pago === "Deposito"
                                    ? "badge--blue"
                                    : linea.pago.forma_pago === "Saldo"
                                      ? "badge--green"
                                      : "badge--amber"
                              }`}
                            >
                              {linea.pago.forma_pago}
                            </span>{" "}
                            {linea.pago.concepto ?? "—"}
                          </td>
                          <td>{linea.pago.referencia ?? "—"}</td>
                          <td className="col-money col-money--green">{fmt(linea.pago.monto)}</td>
                        </tr>
                      ) : (
                        <tr key={`saldo-${linea.mov.id}`}>
                          <td>{linea.mov.created_at.slice(0, 10)}</td>
                          <td>
                            <span
                              className={`badge ${
                                linea.mov.tipo === "devolucion_cancelacion"
                                  ? "badge--amber"
                                  : "badge--green"
                              }`}
                            >
                              {linea.mov.tipo === "devolucion_cancelacion"
                                ? "Devolución"
                                : "Saldo a favor"}
                            </span>
                          </td>
                          <td>{linea.mov.concepto ?? "—"}</td>
                          <td>—</td>
                          <td className="col-money col-money--green">{fmt(linea.mov.importe)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulario de liquidación (solo si hay faltante) */}
            {!esCancelado && faltante > 0.005 && (
              <div className="liquidacion-form-wrap">
                <div className="form-group-title" style={{ color: "#b91c1c" }}>
                  💳 Registrar pago de liquidación — Faltante: {fmt(faltante)}
                </div>

                {liqMutation.isError && (
                  <div className="alert-error" style={{ marginBottom: "10px" }}>
                    {(liqMutation.error as Error).message}
                  </div>
                )}
                {liqMutation.isSuccess && (
                  <div className="alert-success" style={{ marginBottom: "10px" }}>
                    Pago registrado correctamente.
                  </div>
                )}

                <div className="liquidacion-form-grid">
                  <div className="form-field">
                    <label>Monto a pagar (MXN) *</label>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      placeholder={fmt(faltante)}
                      value={liqForm.monto}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setLiqForm((p) => ({ ...p, monto: e.target.value }))}
                    />
                    <span className="field-hint">
                      Faltante: {fmt(faltante)}. Si pagas más, el exceso se registrará como saldo a favor del operador.
                    </span>
                  </div>

                  <div className="form-field">
                    <label>Forma de pago</label>
                    <select
                      value={liqForm.formaPago}
                      onChange={(e) =>
                        setLiqForm((p) => ({
                          ...p,
                          formaPago: e.target.value as FormaPagoLiquidacion,
                          pagoEfectivo: "",
                          pagoDeposito: "",
                          pagoSaldo: "",
                        }))
                      }
                    >
                      <option value="Efectivo">Efectivo</option>
                      <option value="Deposito">Depósito</option>
                      <option value="Saldo">Saldo a favor</option>
                      <option value="Dividida">Dividida</option>
                    </select>
                  </div>

                  {(liqForm.formaPago === "Deposito" ||
                    liqForm.formaPago === "Dividida") && (
                    <div className="form-field">
                      <label>Referencia (depósito)</label>
                      <input
                        type="text"
                        placeholder="Folio / CLABE / transferencia…"
                        value={liqForm.referencia}
                        onChange={(e) =>
                          setLiqForm((p) => ({ ...p, referencia: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  <div className="form-field">
                    <label>Concepto (opcional)</label>
                    <input
                      type="text"
                      placeholder="Nota libre…"
                      value={liqForm.concepto}
                      onChange={(e) =>
                        setLiqForm((p) => ({ ...p, concepto: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Desglose dividida */}
                {liqForm.formaPago === "Dividida" && (
                  <div className="venta-pago-dividido" style={{ marginTop: "10px" }}>
                    <div className="form-field">
                      <label>Efectivo (MXN)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="venta-pago-dividido-input"
                        value={liqForm.pagoEfectivo}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setLiqForm((p) => ({ ...p, pagoEfectivo: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Depósito (MXN)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="venta-pago-dividido-input"
                        value={liqForm.pagoDeposito}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setLiqForm((p) => ({ ...p, pagoDeposito: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Saldo operador (MXN)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="venta-pago-dividido-input"
                        value={liqForm.pagoSaldo}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setLiqForm((p) => ({ ...p, pagoSaldo: e.target.value }))
                        }
                      />
                      {saldoFavor > EPSILON_DEUDA && (
                        <span className="field-hint">
                          Disponible a favor: {fmt(saldoFavor)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {liqForm.formaPago === "Saldo" && saldoFavor > EPSILON_DEUDA && (
                  <p className="field-hint" style={{ marginTop: "4px" }}>
                    Saldo disponible: {fmt(saldoFavor)}
                  </p>
                )}

                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: "12px" }}
                  disabled={liqMutation.isPending}
                  onClick={handleRegistrarLiquidacionClick}
                >
                  {liqMutation.isPending ? "Registrando…" : "Registrar pago"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/ventas")}
          >
            Volver
          </button>
          {!isNew && !esCancelado && (
            <button
              type="button"
              className="btn-cancelar-ticket"
              onClick={() => setShowCancelModal(true)}
            >
              ⛔ Cancelar ticket
            </button>
          )}
          {isNew && !esCancelado && (
            <button
              type="submit"
              className="btn-primary"
              disabled={
                mutation.isPending ||
                bloquearNuevaVentaPorDeuda ||
                form.operador_id == null ||
                !promotorRevisado
              }
            >
              {mutation.isPending
                ? "Guardando…"
                : "Registrar Venta"}
            </button>
          )}
        </div>
      </form>

      {/* Confirmación de sobrepago (nueva venta) */}
      {confirmSobrepago != null && (
        <div className="modal-overlay" onClick={dismissConfirmSobrepago}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title modal-title--info">Confirmar sobrepago</h2>
            <p className="modal-desc">
              Se agregará al operador saldo a favor:{" "}
              <strong style={{ color: "#0f172a" }}>{fmt(confirmSobrepago.amount)}</strong>.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={dismissConfirmSobrepago}>
                Modificar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={mutation.isPending}
                onClick={confirmSobrepagoAndSave}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cancelación */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">⛔ Cancelar ticket</h2>
            <p className="modal-desc">
              Esta acción es irreversible. El ticket quedará cancelado y no se podrán
              registrar más pagos. El historial se conserva.
            </p>
            <div className="form-field" style={{ marginTop: "12px" }}>
              <label>Motivo de cancelación *</label>
              <textarea
                className="modal-textarea"
                rows={3}
                placeholder="Ej. Error en el servicio, duplicado, solicitud del cliente…"
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
              />
            </div>
            {cancelMutation.isError && (
              <p style={{ color: "#b91c1c", marginTop: "8px", fontSize: "13px" }}>
                {(cancelMutation.error as Error).message}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowCancelModal(false); setMotivoCancelacion(""); }}
              >
                No, volver
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? "Cancelando…" : "Sí, cancelar ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
