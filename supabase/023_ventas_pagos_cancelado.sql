-- Migración: Trazabilidad de cancelación en pagos y devolución de saldo

-- 1. Marcar pagos como cancelados cuando su ticket/venta se cancela
alter table public.ventas_pagos
  add column if not exists cancelado boolean not null default false;

create index if not exists idx_ventas_pagos_cancelado
  on public.ventas_pagos (cancelado)
  where cancelado = true;

-- 2. Permitir tipo 'devolucion_cancelacion' en movimientos de saldo
--    (importe positivo = crédito de vuelta al operador)
alter table public.operador_saldo_movimientos
  drop constraint if exists operador_saldo_movimientos_tipo_check;

alter table public.operador_saldo_movimientos
  add constraint operador_saldo_movimientos_tipo_check
  check (tipo in ('abono', 'aplicacion_ticket', 'devolucion_cancelacion'));

-- Devolucion debe ser positiva (es un crédito al operador)
alter table public.operador_saldo_movimientos
  add constraint operador_saldo_devolucion_pos check (
    tipo <> 'devolucion_cancelacion' or importe > 0
  );
