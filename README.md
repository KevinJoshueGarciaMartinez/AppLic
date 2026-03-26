# AppLic

Esqueleto inicial del ERP web (fase 1) con:

- React + Vite + TypeScript
- Supabase client configurado por variables de entorno
- Rutas base en espanol
- Checklist tecnico para validar entorno

## Variables de entorno

Crea un archivo `.env`:

```env
VITE_SUPABASE_URL=https://tu-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

## Ejecutar local

```bash
npm install
npm run dev
```

## Build de produccion

```bash
npm run build
npm run start
```

## Deploy en Render

Este repo incluye `render.yaml` para desplegar un Web Service gratis.
Solo configura en Render:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
