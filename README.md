# Concurso — Sistema de Calificación de Dibujo y Pintura

Sistema web multi-tenant, responsivo y en tiempo real para gestionar concursos institucionales (Poder Judicial del Perú): creación de eventos, inscripción de participantes, calificación por jurados, publicación de resultados y exportación de actas/reportes.

## Estado actual

- Repositorio: [mscnegocio-del/concurso](https://github.com/mscnegocio-del/concurso)
- Proyecto Supabase creado: [becqprcmjxpwiwgflvoj.supabase.co](https://becqprcmjxpwiwgflvoj.supabase.co)
- Aplicación Vite: carpeta [`conuro-app/`](conuro-app/) (ejecutar `npm install` y `npm run dev` desde ahí).
- Stack frontend objetivo: React 18 + TypeScript + Vite
- Estilos: Tailwind CSS v4

### Rutas implementadas (Sprint 2)

- `/` — inicio y enlaces a login / jurado
- `/login` — OTP por correo (admin / administrador)
- `/jurado` y `/jurado/panel` — ingreso jurado (código + nombre, sesión en `sessionStorage`)
- `/admin`, `/administrador`, `/super` — paneles protegidos por rol
- `/publico/:eventoSlug` — placeholder pantalla pública (Sprint 4)

## Stack tecnológico

- Frontend: React 18 + TypeScript + Vite
- Estilos: Tailwind CSS v4
- Backend/DB: Supabase (PostgreSQL + Auth + Realtime + Storage)
- Exportables: `@react-pdf/renderer` (PDF) y `xlsx` (Excel)
- Deploy: Vercel
- Pagos: Lemon Squeezy

## Roles del sistema

- **Super Admin**: gestiona organizaciones, planes y facturación global.
- **Admin**: gestiona eventos y configuración completa de su organización.
- **Administrador**: monitorea progreso y publica resultados por categoría.
- **Jurado**: califica participantes asignados por evento.
- **Público**: visualiza pantalla pública cuando se publican resultados.

## Estructura propuesta

```txt
src/
  components/
    ui/
    admin/
    administrador/
    jurado/
    publico/
  pages/
    admin/
    administrador/
    jurado/
    publico/
  hooks/
  lib/
  types/
  utils/
  stores/
```

## Configuración de entorno

1. Copia el archivo de ejemplo:
   - Windows (PowerShell): `Copy-Item .env.example .env`
   - Linux/macOS: `cp .env.example .env`
2. Completa las variables con valores reales de Supabase, app y Lemon Squeezy.

## Variables requeridas

Ver archivo `.env.example`.

## Flujo MVP priorizado

Orden recomendado para salida rápida:

1. Setup + DB
2. Auth + routing
3. Panel Admin núcleo
4. Panel Jurado (mobile-first)
5. Pantalla pública
6. Cálculo y exportables
7. Panel Administrador (control de publicación)

## Seguridad y arquitectura

- Multi-tenant por `organizacion_id`.
- RLS en todas las tablas.
- Jurado solo accede a sus propias calificaciones.
- Operaciones críticas deben validarse en server-side (Edge Functions).

## Documentación interna

- Definición funcional y técnica: `CLAUDE.md`
- Plan detallado por fases: `plan_implementacion.md`
- Plan operativo por sprints: `plan_sprints_ejecutables.md`

