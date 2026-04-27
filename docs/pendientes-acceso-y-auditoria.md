# Pendientes de acceso y auditoria

## Objetivo funcional
- Registrar toda accion de usuarios loggeados en tablas operativas (`operadores`, `ventas`, `ventas_pagos`, etc).
- Mantener trazabilidad de: quien hizo el cambio, cuando, y antes/despues del registro.

## Estado actual
- Implementado frontend con control de acceso por rol (`admin`, `recepcion`, `ventas`).
- Preparada migracion SQL `supabase/032_acceso_roles_rls_auditoria.sql` con:
  - RLS por rol para tablas clave.
  - Tabla `audit_log`.
  - Triggers de auditoria en tablas operativas.
- Preparada migracion SQL `supabase/033_auth_signup_sync_usuarios.sql` para:
  - Crear registro en `public.usuarios` automaticamente cuando se registra un usuario en `auth.users`.
  - Backfill de usuarios existentes en Auth que no tengan fila en `usuarios`.
- Preparada migracion SQL `supabase/034_usuarios_admin_rls.sql` para:
  - Gestion de `usuarios` y `usuarios_nivel` con RLS.
  - Admin puede administrar usuarios y niveles.
  - Usuario autenticado solo puede leerse a si mismo.
- Implementada pantalla `Usuarios` (solo admin) para asignar nivel y activar/inactivar usuarios desde la app.

## Siguiente paso sugerido
- Ejecutar migracion 034 en Supabase SQL Editor.
- Validar con una cuenta admin que el modulo `Usuarios` lista y actualiza correctamente.
