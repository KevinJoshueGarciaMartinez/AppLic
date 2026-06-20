import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { insertAbonoSaldo } from "../lib/saldoOperador";
import type { Operador } from "../lib/types";

function fmtMoneda(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

function hoyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseMonto(raw: string) {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

type OperadorLookup = Pick<
  Operador,
  | "numero_consecutivo"
  | "nombre"
  | "apellido_paterno"
  | "apellido_materno"
  | "curp"
  | "telefono_1"
  | "es_prospecto"
>;

type ReciboDetalle = {
  id: number;
  operador_id: number;
  tipo: string;
  importe: number;
  fecha: string;
  forma_pago: string | null;
  pago_efectivo: number;
  pago_deposito: number;
  referencia: string | null;
  concepto: string | null;
  venta_id: number | null;
  ticket_id: number | null;
  created_at: string;
  operador_nombre: string;
};

async function buscarOperadores(texto: string): Promise<OperadorLookup[]> {
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
  if (error) throw new Error(error.message);
  return (data ?? []) as OperadorLookup[];
}

async function fetchOperadorBasico(id: number): Promise<OperadorLookup> {
  const { data, error } = await supabase
    .from("operadores")
    .select(
      "numero_consecutivo, nombre, apellido_paterno, apellido_materno, curp, telefono_1, es_prospecto",
    )
    .eq("numero_consecutivo", id)
    .single();
  if (error) throw new Error(error.message);
  return data as OperadorLookup;
}

async function fetchReciboDetalle(id: number): Promise<ReciboDetalle> {
  const { data, error } = await supabase
    .from("operador_saldo_movimientos")
    .select(
      "id, operador_id, tipo, importe, fecha, forma_pago, pago_efectivo, pago_deposito, referencia, concepto, venta_id, ticket_id, created_at",
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const movimiento = data as Omit<ReciboDetalle, "operador_nombre">;
  const operador = await fetchOperadorBasico(Number(movimiento.operador_id));
  const operador_nombre = nombreOperador(operador);

  return {
    ...movimiento,
    operador_nombre,
  };
}

function nombreOperador(op: Partial<OperadorLookup> | null | undefined) {
  return [op?.nombre, op?.apellido_paterno, op?.apellido_materno].filter(Boolean).join(" ");
}

function OperadorSearch({
  operadorId,
  operadorNombre,
  onChange,
}: {
  operadorId: number | null;
  operadorNombre: string;
  onChange: (id: number, nombre: string) => void;
}) {
  const [texto, setTexto] = useState(operadorNombre);
  const [resultados, setResultados] = useState<OperadorLookup[]>([]);
  const [abierto, setAbierto] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTexto(operadorNombre);
  }, [operadorNombre]);

  function handleInput(value: string) {
    setTexto(value);
    if (value === "") {
      setResultados([]);
      setAbierto(false);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await buscarOperadores(value);
        setResultados(res);
        setAbierto(res.length > 0);
      } catch {
        setResultados([]);
        setAbierto(false);
      }
    }, 250);
  }

  function seleccionar(op: OperadorLookup) {
    const nombre = nombreOperador(op);
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
      />
      {operadorId != null && <span className="field-hint">ID: #{operadorId}</span>}
      {abierto && (
        <ul className="autocomplete-list">
          {resultados.map((op) => (
            <li
              key={op.numero_consecutivo}
              className="autocomplete-item"
              onMouseDown={() => seleccionar(op)}
            >
              <span className="autocomplete-nombre">{nombreOperador(op)}</span>
              <span className="autocomplete-curp">
                {op.curp ?? "Sin CURP"}
                {op.telefono_1 ? ` · ${op.telefono_1}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  id?: number;
}

export default function ReciboAbonoForm({ id }: Props) {
  const [, navigate] = useLocation();
  const isNew = id == null;
  const params = new URLSearchParams(window.location.search);
  const operadorIdPrefill = Number(params.get("operadorId") ?? "");
  const operadorIdInicial = Number.isFinite(operadorIdPrefill) ? operadorIdPrefill : null;
  const fechaPrefill = params.get("fecha") || hoyLocal();
  const montoPrefill = params.get("monto") || "";
  const formaPagoPrefill = params.get("formaPago") || "Efectivo";
  const pagoEfectivoPrefill = params.get("pagoEfectivo") || "";
  const pagoDepositoPrefill = params.get("pagoDeposito") || "";
  const referenciaPrefill = params.get("referencia") || "";
  const conceptoPrefill = params.get("concepto") || "";

  const [fecha, setFecha] = useState(fechaPrefill);
  const [operadorId, setOperadorId] = useState<number | null>(operadorIdInicial);
  const [operadorNombre, setOperadorNombre] = useState("");
  const [monto, setMonto] = useState(montoPrefill);
  const [formaPago, setFormaPago] = useState(formaPagoPrefill);
  const [pagoEfectivo, setPagoEfectivo] = useState(pagoEfectivoPrefill);
  const [pagoDeposito, setPagoDeposito] = useState(pagoDepositoPrefill);
  const [referencia, setReferencia] = useState(referenciaPrefill);
  const [concepto, setConcepto] = useState(conceptoPrefill);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: operadorPrefill } = useQuery({
    queryKey: ["operador_basico", operadorIdInicial],
    queryFn: () => fetchOperadorBasico(operadorIdInicial!),
    enabled: isNew && operadorIdInicial != null && operadorNombre === "",
  });

  useEffect(() => {
    if (!operadorPrefill) return;
    setOperadorId(operadorPrefill.numero_consecutivo);
    setOperadorNombre(nombreOperador(operadorPrefill));
  }, [operadorPrefill]);

  const { data: recibo, isLoading } = useQuery({
    queryKey: ["recibo_abono", id],
    queryFn: () => fetchReciboDetalle(id!),
    enabled: !isNew,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (operadorId == null) throw new Error("Selecciona un operador.");
      const importe = parseMonto(monto);
      if (importe <= 0) throw new Error("Captura un monto mayor a cero.");
      const montoEfectivo = parseMonto(pagoEfectivo);
      const montoDeposito = parseMonto(pagoDeposito);
      if (formaPago === "Dividida") {
        const sumaDividida = Math.round((montoEfectivo + montoDeposito) * 100) / 100;
        if (Math.abs(importe - sumaDividida) > 0.02) {
          throw new Error(
            "En pago dividido, el monto debe coincidir con la suma de efectivo y deposito.",
          );
        }
      }
      const conceptoFinal = concepto.trim() || "Abono directo al operador";
      const newId = await insertAbonoSaldo(operadorId, importe, conceptoFinal, {
        fecha,
        formaPago,
        pagoEfectivo: formaPago === "Dividida" ? montoEfectivo : 0,
        pagoDeposito: formaPago === "Dividida" ? montoDeposito : 0,
        referencia,
      });
      if (!newId) throw new Error("No se pudo generar el recibo.");
      return newId;
    },
    onSuccess: (newId) => {
      navigate(`/recibos-abono/${newId}`);
    },
    onError: (error) => {
      setFeedback((error as Error).message);
    },
  });

  const backTo = recibo?.operador_id ?? operadorId;
  const volver = () => {
    if (backTo != null) {
      navigate(`/operadores/${backTo}`);
      return;
    }
    navigate("/ventas");
  };

  function handleFormaPagoChange(value: string) {
    setFormaPago(value);
    if (value !== "Dividida") {
      setPagoEfectivo("");
      setPagoDeposito("");
    }
  }

  function handlePagoDivididoChange(
    field: "efectivo" | "deposito",
    value: string,
  ) {
    const nextEfectivo = field === "efectivo" ? value : pagoEfectivo;
    const nextDeposito = field === "deposito" ? value : pagoDeposito;
    if (field === "efectivo") setPagoEfectivo(value);
    if (field === "deposito") setPagoDeposito(value);
    const total = Math.round((parseMonto(nextEfectivo) + parseMonto(nextDeposito)) * 100) / 100;
    setMonto(total > 0 ? total.toFixed(2) : "");
  }

  if (!isNew && isLoading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner" />
          <span>Cargando recibo...</span>
        </div>
      </div>
    );
  }

  if (!isNew && recibo) {
    return (
      <div className="page-container recibo-page">
        <div className="page-header no-print">
          <div>
            <button className="btn-back" onClick={volver}>
              ← Volver
            </button>
            <h1 className="page-title">
              <span className="page-icon">🧾</span> Recibo #{recibo.id}
            </h1>
            <p className="page-subtitle">
              {recibo.operador_nombre || `Operador #${recibo.operador_id}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" className="btn-secondary" onClick={() => navigate(`/recibos-abono/nuevo?operadorId=${recibo.operador_id}`)}>
              Nuevo recibo
            </button>
            <button type="button" className="btn-primary" onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
        </div>

        <div className="print-only print-header">
          <h2>Recibo de abono</h2>
          <p>Folio #{recibo.id}</p>
        </div>

        <div className="record-form recibo-sheet">
          <div className="form-section">
            <div className="recibo-grid">
              <div className="recibo-field">
                <span className="recibo-label">Folio</span>
                <strong>#{recibo.id}</strong>
              </div>
              <div className="recibo-field">
                <span className="recibo-label">Fecha</span>
                <strong>{recibo.fecha}</strong>
              </div>
              <div className="recibo-field">
                <span className="recibo-label">Operador</span>
                <strong>{recibo.operador_nombre || `Operador #${recibo.operador_id}`}</strong>
              </div>
              <div className="recibo-field">
                <span className="recibo-label">Monto</span>
                <strong>{fmtMoneda(Number(recibo.importe ?? 0))}</strong>
              </div>
              <div className="recibo-field">
                <span className="recibo-label">Forma de pago</span>
                <strong>{recibo.forma_pago ?? "—"}</strong>
              </div>
              {recibo.forma_pago === "Dividida" && (
                <>
                  <div className="recibo-field">
                    <span className="recibo-label">Efectivo</span>
                    <strong>{fmtMoneda(Number(recibo.pago_efectivo ?? 0))}</strong>
                  </div>
                  <div className="recibo-field">
                    <span className="recibo-label">Depósito</span>
                    <strong>{fmtMoneda(Number(recibo.pago_deposito ?? 0))}</strong>
                  </div>
                </>
              )}
              <div className="recibo-field">
                <span className="recibo-label">Referencia</span>
                <strong>{recibo.referencia?.trim() || "—"}</strong>
              </div>
              <div className="recibo-field recibo-field--full">
                <span className="recibo-label">Concepto</span>
                <strong>{recibo.concepto?.trim() || "—"}</strong>
              </div>
              {(recibo.ticket_id != null || recibo.venta_id != null) && (
                <div className="recibo-field recibo-field--full">
                  <span className="recibo-label">Vinculación</span>
                  <strong>
                    {recibo.ticket_id != null
                      ? `Ticket #${recibo.ticket_id}`
                      : `Venta #${recibo.venta_id}`}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <button className="btn-back" onClick={volver}>
            ← Volver
          </button>
          <h1 className="page-title">
            <span className="page-icon">🧾</span> Nuevo recibo de abono
          </h1>
          <p className="page-subtitle">
            Crea un recibo sin servicio y registra el abono directo al operador.
          </p>
        </div>
      </div>

      {feedback && <div className="alert-error">{feedback}</div>}

      <form
        className="record-form"
        onSubmit={(e) => {
          e.preventDefault();
          setFeedback(null);
          saveMutation.mutate();
        }}
      >
        <div className="form-section">
          <div className="form-grid form-grid-2">
            <div className="form-field">
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Operador</label>
              <OperadorSearch
                operadorId={operadorId}
                operadorNombre={operadorNombre}
                onChange={(nextId, nextNombre) => {
                  setOperadorId(nextId);
                  setOperadorNombre(nextNombre);
                }}
              />
            </div>
            <div className="form-field">
              <label>Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Forma de pago</label>
              <select value={formaPago} onChange={(e) => handleFormaPagoChange(e.target.value)}>
                <option value="Efectivo">Efectivo</option>
                <option value="Deposito">Depósito</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Dividida">Dividida</option>
              </select>
            </div>
            {formaPago === "Dividida" && (
              <>
                <div className="form-field">
                  <label>Efectivo (MXN)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={pagoEfectivo}
                    onChange={(e) => handlePagoDivididoChange("efectivo", e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Depósito (MXN)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={pagoDeposito}
                    onChange={(e) => handlePagoDivididoChange("deposito", e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="form-field">
              <label>Referencia</label>
              <input
                type="text"
                placeholder="Ej. folio, transferencia, autorización..."
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Concepto</label>
              <input
                type="text"
                placeholder="Nota interna del recibo"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={volver}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Guardando..." : "Crear recibo"}
          </button>
        </div>
      </form>
    </div>
  );
}
