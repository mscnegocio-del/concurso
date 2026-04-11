# Conuro — App web (concurso de dibujo y pintura)

Frontend del sistema multi-tenant descrito en el [`CLAUDE.md`](../CLAUDE.md) del repositorio raíz.

## Requisitos

- Node.js LTS (18+)
- Proyecto **Supabase** con las migraciones aplicadas (`supabase/migrations/`)

## Arranque local

```bash
npm install
cp .env.example .env   # en Windows: copiar manualmente
```

Editar `.env`:

- `VITE_SUPABASE_URL` — URL del proyecto Supabase  
- `VITE_SUPABASE_ANON_KEY` — clave anónima (Settings → API)  
- `VITE_APP_URL` — opcional; por defecto `http://localhost:5173`

```bash
npm run dev
```

Abre la URL que indique la terminal (normalmente [http://localhost:5173](http://localhost:5173)).

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Typecheck + build producción |
| `npm run preview` | Vista previa del build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (ranking y planes) |

## Rutas útiles para pruebas

- `/login` — Admin, Administrador, Super Admin (OTP correo)
- `/admin/evento` — Configuración del evento más reciente
- `/admin/historial` — Lista de eventos y clonado
- `/super` — Organizaciones (solo `super_admin`)
- `/jurado` — Acceso jurado (código de evento + nombre)
- `/publico/<CODIGO>` — Pantalla pública (`CODIGO` = `codigo_acceso` de 6 caracteres)

## Documentación de negocio y arquitectura

Ver **[../CLAUDE.md](../CLAUDE.md)** (stack, roles, RPCs, planes, estado operativo sugerido).
