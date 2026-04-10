-- Comprobación de movimientos bancarios / depósito en ventas_pagos

alter table public.ventas_pagos
  add column if not exists comprobado boolean not null default false;

alter table public.ventas_pagos
  add column if not exists comprobado_at timestamptz;

create index if not exists idx_ventas_pagos_comprobado_fecha
  on public.ventas_pagos (fecha desc, comprobado)
  where cancelado = false;

comment on column public.ventas_pagos.comprobado is
  'El usuario revisó que el depósito/transferencia aparece en el banco.';
comment on column public.ventas_pagos.comprobado_at is
  'Momento en que se marcó como comprobado (null si no comprobado).';
