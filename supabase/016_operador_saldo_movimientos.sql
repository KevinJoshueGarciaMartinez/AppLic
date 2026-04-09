-- Movimientos de saldo a favor (wallet) por operador.
-- importe > 0 = abono; importe < 0 = aplicación a liquidación (futuro).
-- Saldo a favor (wallet) = sum(importe).
-- Saldo en contra (deuda) = sum(ventas.faltante) donde operador_id y faltante > 0 (consulta en app).

create table if not exists public.operador_saldo_movimientos (
  id bigint primary key generated always as identity,
  operador_id bigint not null
    references public.operadores (numero_consecutivo) on delete restrict,
  tipo text not null default 'abono'
    check (tipo in ('abono', 'aplicacion_ticket')),
  importe numeric(12,2) not null,
  concepto text,
  venta_id bigint references public.ventas (id) on delete set null,
  ticket_id bigint references public.tickets (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operador_saldo_importe_abono_pos check (
    tipo <> 'abono' or importe > 0
  ),
  constraint operador_saldo_importe_aplicacion_neg check (
    tipo <> 'aplicacion_ticket' or importe < 0
  )
);

create index if not exists idx_operador_saldo_mov_operador
  on public.operador_saldo_movimientos (operador_id);

create index if not exists idx_operador_saldo_mov_created
  on public.operador_saldo_movimientos (created_at desc);

create index if not exists idx_ventas_operador_faltante
  on public.ventas (operador_id)
  where faltante > 0;
