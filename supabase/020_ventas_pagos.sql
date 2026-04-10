-- Migración: Tabla de pagos/liquidaciones por venta o ticket
-- Permite registrar pagos adicionales sobre ventas con faltante pendiente.
-- Estrategia: al insertar un pago se actualiza ventas.cobro += monto,
-- por lo que ventas.faltante (columna generada: costo - cobro) se corrige automáticamente.
-- El historial completo de pagos queda en esta tabla.

create table if not exists public.ventas_pagos (
  id            bigint primary key generated always as identity,

  -- Liga a una sola venta (sin ticket) O a un ticket (multi-servicio).
  -- Exactamente uno de los dos debe ser no-nulo.
  venta_id      bigint references public.ventas(id)  on delete cascade,
  ticket_id     bigint references public.tickets(id) on delete cascade,

  fecha         date           not null default current_date,
  monto         numeric(12,2)  not null check (monto > 0),

  forma_pago    text not null default 'Efectivo'
                check (forma_pago in ('Efectivo', 'Deposito', 'Saldo', 'Dividida')),

  -- Desglose cuando forma_pago = Dividida
  pago_efectivo numeric(12,2) not null default 0 check (pago_efectivo >= 0),
  pago_deposito numeric(12,2) not null default 0 check (pago_deposito >= 0),
  pago_saldo    numeric(12,2) not null default 0 check (pago_saldo    >= 0),

  referencia    text,   -- número de referencia para depósito
  concepto      text,   -- nota libre

  created_at    timestamptz not null default now(),

  constraint ventas_pagos_one_link check (
    (venta_id  is not null)::int +
    (ticket_id is not null)::int = 1
  )
);

create index if not exists idx_ventas_pagos_venta   on public.ventas_pagos (venta_id);
create index if not exists idx_ventas_pagos_ticket  on public.ventas_pagos (ticket_id);
create index if not exists idx_ventas_pagos_fecha   on public.ventas_pagos (fecha desc);
