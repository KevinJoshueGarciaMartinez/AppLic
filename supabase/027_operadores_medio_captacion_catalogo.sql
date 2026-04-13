-- Ampliar catálogo de medio_captacion (UI: CLIENTE, RECOMENDADO, …).
-- Se mantienen valores de 024 para filas ya guardadas.

alter table public.operadores
  drop constraint if exists operadores_medio_captacion_check;

alter table public.operadores
  add constraint operadores_medio_captacion_check check (
    medio_captacion is null
    or medio_captacion in (
      'CLIENTE',
      'RECOMENDADO',
      'ASIGNADO',
      'REDES SOCIALES',
      'GOOGLE MAPS',
      'JIMMY',
      'LONA',
      'TARJETEO',
      'Email',
      'Telefono',
      'Redes',
      'Presencial',
      'Referido',
      'Otro'
    )
  );
