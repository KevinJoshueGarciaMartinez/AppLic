import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchResumenReembolsoSaldoOperador,
  solicitarReembolsoSaldoOperador,
} from "../lib/reembolsos";
import type { FormaReembolso } from "../lib/types";

type Props = {
  operadorId: number;
  compact?: boolean;
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

function numero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export default function SolicitudReembolsoSaldo({ operadorId, compact = false }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["reembolso_saldo_operador_resumen", operadorId] as const;
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState<FormaReembolso>("Deposito");
  const [efectivo, setEfectivo] = useState("");
  const [deposito, setDeposito] = useState("");
  const [motivo, setMotivo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [errorLocal, setErrorLocal] = useState("");

  const { data: resumen, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchResumenReembolsoSaldoOperador(operadorId),
  });

  const disponible = resumen?.disponible ?? 0;
  const montoNumero = numero(monto);
  const efectivoNumero = forma === "Efectivo"
    ? montoNumero
    : forma === "Deposito" ? 0 : numero(efectivo);
  const depositoNumero = forma === "Deposito"
    ? montoNumero
    : forma === "Efectivo" ? 0 : numero(deposito);
  const requiereReferencia = depositoNumero > 0;

  const validacion = useMemo(() => {
    if (montoNumero <= 0) return "CAPTURA UN MONTO MAYOR A CERO.";
    if (montoNumero > disponible) return `EL MAXIMO DISPONIBLE ES ${fmt(disponible)}.`;
    if (motivo.trim().length < 5) return "EL MOTIVO DEBE TENER AL MENOS 5 CARACTERES.";
    if (forma === "Dividida" && (efectivoNumero <= 0 || depositoNumero <= 0)) {
      return "CAPTURA UN IMPORTE MAYOR A CERO EN EFECTIVO Y DEPOSITO.";
    }
    if (Math.round((efectivoNumero + depositoNumero) * 100) !== Math.round(montoNumero * 100)) {
      return "EL DESGLOSE DE ENTREGA NO COINCIDE CON EL MONTO.";
    }
    if (requiereReferencia && referencia.trim().length < 3) {
      return "CAPTURA LA REFERENCIA O IDENTIFICACION DEL COMPROBANTE.";
    }
    return "";
  }, [depositoNumero, disponible, efectivoNumero, forma, montoNumero, motivo, referencia, requiereReferencia]);

  useEffect(() => {
    if (!abierto) return;
    setMonto(disponible > 0 ? disponible.toFixed(2) : "");
    setForma("Deposito");
    setEfectivo("");
    setDeposito("");
    setMotivo("");
    setReferencia("");
    setObservaciones("");
    setErrorLocal("");
  }, [abierto, disponible]);

  const solicitar = useMutation({
    mutationFn: () => solicitarReembolsoSaldoOperador({
      operadorId,
      monto: montoNumero,
      formaReembolso: forma,
      reembolsoEfectivo: efectivoNumero,
      reembolsoDeposito: depositoNumero,
      motivo: motivo.trim(),
      referencia: referencia.trim() || null,
      observaciones: observaciones.trim() || null,
      idempotencyKey: crypto.randomUUID(),
    }),
    onSuccess: async (id) => {
      setAbierto(false);
      setMensaje(`SOLICITUD #${id} ENVIADA A AUTORIZACION.`);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["bandeja_reembolsos"] });
    },
  });

  function enviar() {
    setMensaje("");
    setErrorLocal(validacion);
    if (validacion) return;
    solicitar.mutate();
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          className={mensaje ? "btn-secondary reembolso-saldo-compacto" : "btn-reembolso reembolso-saldo-compacto"}
          disabled={isLoading || disponible <= 0 || Boolean(error)}
          onClick={() => { setMensaje(""); setAbierto(true); }}
          title={error ? (error as Error).message : `DISPONIBLE: ${fmt(disponible)}`}
        >
          {mensaje || `REEMBOLSAR SALDO A FAVOR (${fmt(disponible)})`}
        </button>
      ) : (
        <div className="operador-reembolso-saldo">
          <div>
            <div className="form-group-title">Reembolso de saldo</div>
            <p className="operador-reembolso-saldo__texto">
              REGISTRA EL DINERO QUE YA SE DEVOLVIO AL OPERADOR. EL SALDO BAJARA CUANDO ADMINISTRACION LO AUTORICE.
            </p>
          </div>
          <div className="operador-reembolso-saldo__resumen">
            <span>DISPONIBLE</span>
            <strong>{isLoading ? "…" : fmt(disponible)}</strong>
            {(resumen?.reservado ?? 0) > 0 && (
              <small>{fmt(resumen?.reservado ?? 0)} EN ESPERA DE AUTORIZACION</small>
            )}
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={isLoading || disponible <= 0 || Boolean(error)}
            onClick={() => { setMensaje(""); setAbierto(true); }}
          >
            Solicitar reembolso
          </button>
          {mensaje && <div className="alert-success operador-reembolso-saldo__alerta">{mensaje}</div>}
          {error && <div className="alert-error operador-reembolso-saldo__alerta">{(error as Error).message}</div>}
        </div>
      )}

      {abierto && (
        <div className="modal-overlay" onClick={() => setAbierto(false)}>
          <div
            className="modal-card modal-card--lg reembolso-saldo-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reembolso-saldo-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={() => setAbierto(false)} aria-label="CERRAR">×</button>
            <h2 id="reembolso-saldo-titulo" className="modal-title">SOLICITAR REEMBOLSO DE SALDO</h2>
            <p className="modal-subtitle">
              DISPONIBLE: <strong>{fmt(disponible)}</strong>. ESTA SOLICITUD QUEDARA PENDIENTE DE UNA SOLA AUTORIZACION.
            </p>

            <div className="form-grid form-grid-2 reembolso-saldo-form">
              <div className="form-field">
                <label>Monto a reembolsar (MXN) *</label>
                <input type="number" min="0.01" max={disponible} step="0.01" value={monto} onChange={(event) => setMonto(event.target.value)} autoFocus />
              </div>
              <div className="form-field">
                <label>Forma de entrega *</label>
                <select value={forma} onChange={(event) => setForma(event.target.value as FormaReembolso)}>
                  <option value="Deposito">DEPOSITO / TRANSFERENCIA</option>
                  <option value="Efectivo">EFECTIVO</option>
                  <option value="Dividida">DIVIDIDA</option>
                </select>
              </div>

              {forma === "Dividida" && (
                <>
                  <div className="form-field">
                    <label>Entregado en efectivo *</label>
                    <input type="number" min="0" step="0.01" value={efectivo} onChange={(event) => setEfectivo(event.target.value)} />
                  </div>
                  <div className="form-field">
                    <label>Entregado por deposito *</label>
                    <input type="number" min="0" step="0.01" value={deposito} onChange={(event) => setDeposito(event.target.value)} />
                  </div>
                </>
              )}

              <div className="form-field form-field-full">
                <label>Motivo *</label>
                <input type="text" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="EJ. RETORNO DE PAGO" />
              </div>

              {requiereReferencia && (
                <div className="form-field form-field-full">
                  <label>Referencia o comprobante *</label>
                  <input type="text" value={referencia} onChange={(event) => setReferencia(event.target.value)} placeholder="EJ. TRANSFERENCIA 15/08 10:33 H" />
                  <span className="field-hint">CAPTURA LA REFERENCIA BANCARIA O COMO IDENTIFICAR EL COMPROBANTE RECIBIDO.</span>
                </div>
              )}

              <div className="form-field form-field-full">
                <label>Observaciones</label>
                <textarea rows={3} value={observaciones} onChange={(event) => setObservaciones(event.target.value)} placeholder="NOTA OPCIONAL..." />
              </div>
            </div>

            {(errorLocal || solicitar.error) && (
              <div className="alert-error">{errorLocal || (solicitar.error as Error).message}</div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setAbierto(false)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={solicitar.isPending} onClick={enviar}>
                {solicitar.isPending ? "ENVIANDO..." : "ENVIAR A AUTORIZACION"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
