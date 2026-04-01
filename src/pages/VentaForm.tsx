import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Venta, VentaInsert, Servicio, Promotor, Operador } from "../lib/types";

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

async function fetchServicios(): Promise<Servicio[]> {
  const { data, error } = await supabase
    .from("catalogo_servicios_costos")
    .select("id_servicio, orden, servicio, tipo_servicio, costo_base")
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
    .select("numero_consecutivo, nombre, apellido_paterno, apellido_materno, curp")
    .or(
      `curp.ilike.%${texto}%,nombre.ilike.%${texto}%,apellido_paterno.ilike.%${texto}%`,
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

function emptyForm(): VentaInsert {
  return {
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
    numero_referencia: null,
    observaciones: null,
    fecha_solicitud_curso: null,
  };
}

// ── Operador autocomplete ─────────────────────────────────────────────────────

function OperadorSearch({
  operadorId,
  operadorNombre,
  onChange,
}: {
  operadorId: number | null;
  operadorNombre: string | null;
  onChange: (id: number, nombre: string) => void;
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
        placeholder="Buscar por nombre o CURP..."
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
              <span className="autocomplete-curp">{op.curp}</span>
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
  const [form, setForm] = useState<VentaInsert>(emptyForm());
  const [guardado, setGuardado] = useState(false);

  // Cargar venta existente
  const { isLoading: loadingVenta, data: ventaData } = useQuery({
    queryKey: ["venta", id],
    queryFn: () => fetchVenta(id!),
    enabled: !isNew,
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
        ...rest
      } = ventaData;
      setForm(rest as VentaInsert);
    }
  }, [ventaData]);

  const { data: servicios = [] } = useQuery({
    queryKey: ["servicios"],
    queryFn: fetchServicios,
  });

  const { data: promotores = [] } = useQuery({
    queryKey: ["promotores"],
    queryFn: fetchPromotores,
  });

  const mutation = useMutation({
    mutationFn: async (payload: VentaInsert) => {
      if (isNew) {
        const { error } = await supabase.from("ventas").insert(payload);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("ventas")
          .update(payload)
          .eq("id", id!);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
      if (isNew) navigate("/ventas");
    },
  });

  function set<K extends keyof VentaInsert>(key: K, value: VentaInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleServicioChange(idServicio: number) {
    const srv = servicios.find((s) => s.id_servicio === idServicio);
    if (srv) {
      setForm((prev) => ({
        ...prev,
        id_servicio: srv.id_servicio,
        servicio: srv.servicio,
        tipo_servicio: srv.tipo_servicio,
        costo: srv.costo_base,
      }));
    }
  }

  function handlePromotorChange(idPromotor: number) {
    const p = promotores.find((x) => x.id_promotor === idPromotor);
    setForm((prev) => ({
      ...prev,
      id_promotor: idPromotor,
      promotor: p?.nombre ?? null,
    }));
  }

  // Valores calculados en tiempo real
  const comisionPromotor = form.costo - form.costo_promotor;
  const faltante = form.costo - form.cobro;
  const totalCobrado = form.cobro - form.egreso;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(form);
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
          {/* ── Columna izquierda ── */}
          <div>
            {/* Operador */}
            <div className="form-group-title" style={{ marginTop: "1.25rem" }}>
              Operador
            </div>
            <div className="form-field">
              <label>Buscar operador</label>
              <OperadorSearch
                operadorId={form.operador_id}
                operadorNombre={form.operador_nombre}
                onChange={(id, nombre) =>
                  setForm((prev) => ({ ...prev, operador_id: id, operador_nombre: nombre }))
                }
              />
            </div>

            {/* Servicio */}
            <div className="form-group-title" style={{ marginTop: "1.25rem" }}>
              Servicio
            </div>
            <div className="form-field">
              <label>Servicio *</label>
              <select
                value={form.id_servicio ?? ""}
                onChange={(e) =>
                  e.target.value
                    ? handleServicioChange(Number(e.target.value))
                    : set("id_servicio", null)
                }
                required
              >
                <option value="">— Seleccionar servicio —</option>
                {servicios.map((s) => (
                  <option key={s.id_servicio} value={s.id_servicio}>
                    {s.servicio}
                  </option>
                ))}
              </select>
            </div>

            {/* Promotor */}
            <div className="form-group-title" style={{ marginTop: "1.25rem" }}>
              Promotor
            </div>
            <div className="form-field">
              <label>Promotor</label>
              <select
                value={form.id_promotor ?? ""}
                onChange={(e) =>
                  e.target.value
                    ? handlePromotorChange(Number(e.target.value))
                    : setForm((prev) => ({
                        ...prev,
                        id_promotor: null,
                        promotor: null,
                      }))
                }
              >
                <option value="">— Sin promotor —</option>
                {promotores.map((p) => (
                  <option key={p.id_promotor} value={p.id_promotor}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Observaciones */}
            <div className="form-group-title" style={{ marginTop: "1.25rem" }}>
              Notas
            </div>
            <div className="form-field">
              <label>Observaciones</label>
              <textarea
                rows={3}
                value={form.observaciones ?? ""}
                onChange={(e) =>
                  set("observaciones", e.target.value || null)
                }
              />
            </div>
            <div className="form-field" style={{ marginTop: "0.75rem" }}>
              <label>Fecha solicitud de curso</label>
              <input
                type="date"
                value={form.fecha_solicitud_curso ?? ""}
                onChange={(e) =>
                  set("fecha_solicitud_curso", e.target.value || null)
                }
              />
            </div>
          </div>

          {/* ── Columna derecha: cobros ── */}
          <div>
            <div className="cobro-card">
              <div className="form-group-title">Costos y cobros</div>

              <div className="form-field">
                <label>Costo del servicio (MXN)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costo}
                  onChange={(e) => set("costo", Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-field">
                <label>Costo para el promotor (MXN)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costo_promotor}
                  onChange={(e) =>
                    set("costo_promotor", Number(e.target.value))
                  }
                />
              </div>

              <div className="calc-row">
                <span>Comisión promotor</span>
                <span
                  className={comisionPromotor >= 0 ? "calc-green" : "calc-red"}
                >
                  {fmt(comisionPromotor)}
                </span>
              </div>

              <hr className="divider" />

              <div className="form-field">
                <label>Cobro recibido (MXN)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cobro}
                  onChange={(e) => set("cobro", Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-field">
                <label>Egreso (MXN)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.egreso}
                  onChange={(e) => set("egreso", Number(e.target.value))}
                />
              </div>

              <div className="calc-row">
                <span>Faltante</span>
                <span className={faltante > 0 ? "calc-red" : "calc-green"}>
                  {fmt(faltante)}
                </span>
              </div>
              <div className="calc-row calc-row--total">
                <span>Total cobrado neto</span>
                <span className="calc-green">{fmt(totalCobrado)}</span>
              </div>

              <hr className="divider" />

              <div className="form-field">
                <label>Forma de pago</label>
                <select
                  value={form.forma_pago}
                  onChange={(e) =>
                    set("forma_pago", e.target.value as "Efectivo" | "Deposito")
                  }
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Deposito">Depósito</option>
                </select>
              </div>

              {form.forma_pago === "Deposito" && (
                <div className="form-field">
                  <label>Número de referencia</label>
                  <input
                    type="number"
                    value={form.numero_referencia ?? ""}
                    onChange={(e) =>
                      set(
                        "numero_referencia",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </div>
              )}

              <label className="checkbox-label" style={{ marginTop: "1rem" }}>
                <input
                  type="checkbox"
                  checked={!!form.comision_pagada}
                  onChange={(e) => set("comision_pagada", e.target.checked)}
                />
                Comisión del promotor pagada
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/ventas")}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? "Guardando…"
              : isNew
                ? "Registrar Venta"
                : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
