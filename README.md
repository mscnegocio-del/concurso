# ConcursoApp — Plataforma de concursos con jurados y pantalla pública 

Sistema web multi-tenant para instituciones que organizan concursos evaluados por jurado: configuración de eventos, calificación en tiempo real, publicación de podio en TV/proyector y exportación oficial (Excel/PDF según plan).

## Estado actual (Abr 2026)

- Repositorio: [mscnegocio-del/concurso](https://github.com/mscnegocio-del/concurso)
- App frontend: [`conuro-app/`](conuro-app/)
- Supabase: migraciones activas en `conuro-app/supabase/migrations/`
- Flujo operativo implementado:
  - Admin crea evento (elige: "¿Con pantalla TV/proyector?" Sí/No), configura categorías, criterios, participantes y jurados.
  - Admin puede subir flyer/imagen (opcional) — se muestra en estado `abierto` como sala de espera.
  - Admin activa/desactiva pantalla pública desde sección toggle (sin recargar).
  - Jurados califican sin cuenta Auth (token de sesión por jurado).
  - Administrador/admin publica por categoría en coordinación (registra resultados + (opcionalmente) en TV si está activada).
  - Pantalla pública muestra progreso y podio por categoría (también accesible si TV desactivada).
  - Exportaciones Excel/PDF con acta profesional (logos, metadatos, criterios, tabla de rankings, firmas, paginación).

## Novedades recientes

### Sprint 8 — Reorganización UI y Gestión de Usuarios (15 de abril 2026)

#### Sidebars reorganizados con iconos
- **Admin:** Nuevo sidebar con 6 ítems + iconos (Inicio, **Historial**, **Usuarios**, Plantillas, Organización, Panel en vivo)
  - ✅ "Gestión del evento" eliminado (acceso via Historial)
  - ✅ Renombrado "Coordinación de sala" → "Panel en vivo"
  - ✅ Fix duplicado "Inicio" → ahora "Panel de control"
  
- **Coordinador:** 2 ítems + iconos (Inicio, Historial)
- **Super Admin:** 2 ítems + iconos (Organizaciones, **Usuarios**)

#### Gestión de Usuarios ✨ NUEVO
- **Admin (`/admin/usuarios`):**
  - 📧 Invitar coordinador por email (invitación automática Supabase Auth)
  - 👥 Listar usuarios con estado de confirmación (Confirmado/Pendiente)
  - 🗑️ Eliminar coordinador (protección contra auto-eliminación)
  - 🔄 Realtime: actualizaciones automáticas en lista

- **Super Admin (`/super/usuarios`):**
  - 🏢 Selector de organización
  - 📧 Invitar admin o coordinador a cualquier org
  - 👥 Listar usuarios por org con estado
  - 🗑️ Eliminar usuario (solo super_admin)
  - 🔄 Realtime: cambios automáticos por org

- **Edge Function `invite-user`:**
  - Autenticación JWT + validación de permisos
  - Invitación por email (Supabase Auth native)
  - Inserción automática en `public.usuarios`
  - Manejo de errores con rollback

- **RPCs nuevas (`20260415_005_admin_usuarios_rpcs.sql`):**
  - `admin_eliminar_usuario(p_usuario_id)` — elimina con validaciones
  - `admin_listar_usuarios(p_org_id)` — lista con estado de confirmación

#### Eliminación de Eventos con Auditoría
- ✅ Nuevo botón **"Eliminar"** en tabla de historial (desktop + mobile)
- ✅ Solo eventos en `borrador` (botón deshabilitado si otro estado)
- ✅ Confirmación con AlertDialog
- ✅ Registro en `audit_log`: acción `evento_eliminado`, detalles del evento
- ✅ Limpieza de preferencias (evento "en foco" si aplica)

#### Checklist nuevo
- [ ] Admin → `/admin/usuarios` → invitar coordinador por email
- [ ] Usuario recibe email de invitación → confirma cuenta
- [ ] Coordinador aparece en lista con badge "Confirmado"
- [ ] Super Admin → `/super/usuarios` → selector org → invitar admin a otra org
- [ ] `/admin/historial` → evento en borrador → botón "Eliminar" habilitado
- [ ] Evento en otro estado → botón "Eliminar" deshabilitado (tooltip)
- [ ] Confirmar eliminación → audit_log registra acción
- [ ] Sidebars muestran iconos correctamente (Inicio ≠ duplicado)

### Sprint 8 (15 de abril 2026) — Anteriores

#### Configuración flexible de pantalla pública
- **Flyer / Imagen del evento (opcional):**
  - Admin puede subir JPEG/PNG/WebP (máx 2 MB) desde pantalla de configuración del evento
  - Se muestra a pantalla **completa en estado `abierto`** (sala de espera visual)
  - En estados `calificando`, `cerrado`, `publicado` muestra layout tradicional
  - Almacenado en bucket `eventos-flyers` (Supabase Storage)
  
- **Toggle "¿Tiene pantalla pública (TV/proyector)?":**
  - Al crear evento: opción "Sí (con TV)" / "No (sin TV)" — default: Sí
  - Admin puede activar/desactivar desde sección nueva `SeccionToggleTV` sin recargar página
  - Si desactivada: oculta sección "Pantalla pública (TV)" en admin, pero mantiene tabs Publicar e Historial en administrador
  - Pantalla pública `/publico/:codigo` **sigue funcionando** (la columna es solo para control admin)

- **Desempate visible en panel administrador (sin TV):**
  - Nuevo componente `DesempateInlinePanel` (expandible por lugar)
  - Cuando `tiene_tv_publica = false` y hay empates: muestra inline con criterio de desempate, puntajes por criterio, ganador
  - Cuando `tiene_tv_publica = true`: mantiene botones "Mostrar/Ocultar en TV" originales

#### PDF — Acta de resultados profesional (15 de abril)
- Logos centrados (110×70 px) con separador vertical si hay dos
- Jerarquía visual: línea divisoria azul marino, org 13pt, evento 17pt bold
- Metadatos en línea: fecha, código de acceso, temática
- Sección "Criterios de evaluación" con lista numerada
- Rankings como tabla: Puesto/Participante/Código/Puntaje, filas alternadas
- Firmas individuales: grid 2 columnas, línea por jurado
- Paginación: "Página N de M"

#### UI/UX — Panel Administrador (14 de abril)
- Sidebar sticky en desktop
- Alertas con colores semánticos (verde/ámbar)
- Dashboard responsivo (2 columnas)

### Sprints anteriores
- Plantillas de criterios por organización (CRUD + aplicar en evento + opción al crear evento).
- Importación de jurados desde eventos anteriores.
- Personalización de pantalla pública (tema claro/oscuro + color acento).
- Revelación de podio por evento:
  - `simultaneo` (todos los puestos juntos)
  - `escalonado` (`3→2→1` o `2→1` según podio)
  - bloqueo de cambio de categoría mientras una revelación escalonada esté incompleta.
- Indicador de estado de conexión (🟢 Realtime / 🟡 Polling / 🔴 Sin conexión)
- Transición suave del podio (fade + scale con `prefers-reduced-motion`)

## Arquitectura de eventos (nuevas columnas)

| Columna | Tipo | Default | Uso |
|---------|------|---------|-----|
| `flyer_url` | text | null | URL pública en Storage; se muestra a pantalla completa en estado `abierto` |
| `tiene_tv_publica` | boolean | true | Si false: admin oculta sección "Pantalla pública (TV)", pero `/publico/:codigo` sigue funcionando |

**Almacenamiento:**
- Flyers: bucket `eventos-flyers` en Supabase Storage (políticas RLS por org)
- Path: `{org_id}/{evento_id}/flyer-{timestamp}.{ext}`

## Rutas principales

### Admin
- `/admin` — **Panel de control** (dashboard con estadísticas, crear evento rápido, últimos eventos)
- `/admin/evento/:id` — configuración evento (categorías, criterios, participantes, jurados, TV toggle, flyer)
- `/admin/historial` — lista eventos con CRUD (crear, clonar, **eliminar** con auditoría)
- `/admin/usuarios` — **gestionar coordinadores** ✨ NUEVO (invitar, listar, eliminar con Realtime)
- `/admin/plantillas-criterios` — CRUD plantillas de criterios
- `/admin/organizacion` — logos, branding, sonido
- `/admin/coordinacion` — coordinación de sala (renombrado de "Coordinación")

### Coordinador
- `/administrador` — panel inicial (próximos eventos)
- `/administrador/historial` — historial eventos
- `/administrador/evento/:id` — coordinación/publicación (progreso, ranking, desempate inline si no hay TV)

### Super Admin
- `/super` — gestión de organizaciones (crear, cambiar plan, toggle activo)
- `/super/usuarios` — **gestionar usuarios multi-org** ✨ NUEVO (invitar admin/coordinador, listar, eliminar con Realtime)

### Público/Jurado/Auth
- `/login` — acceso OTP (`admin`, `administrador`, `super_admin`)
- `/jurado` — login jurado (código evento + nombre)
- `/jurado/panel` — dashboard jurado (categorías)
- `/jurado/panel/categoria/:id` — listar participantes
- `/jurado/panel/categoria/:id/participante/:pid` — calificación
- `/publico/:codigo_acceso` — pantalla TV/navegador (flyer en estado `abierto`, de lo contrario progreso + podio)

## Arranque local rápido

```bash
cd conuro-app
npm install
# Copiar .env.example a .env y completar variables
npm run dev
```

## Documentación interna

- Arquitectura/negocio y estado técnico: [`CLAUDE.md`](CLAUDE.md)
- Plan por fases: [`plan_implementacion.md`](plan_implementacion.md)
- Plan por sprints y riesgos: [`plan_sprints_ejecutables.md`](plan_sprints_ejecutables.md)

## Hallazgos/puntos de atención

- Existe warning de bundle grande en build (`index` y `acta-pdf-download`), sin romper compilación.
- El webhook de Lemon Squeezy está en estado esqueleto; falta endurecer validación de firma y actualización final de plan para producción.

## Checklist de pruebas (nuevas funcionalidades)

- [ ] **Flyer:** Crear evento → ir a AdminEventoPage → subir JPEG/PNG/WebP (< 2 MB) → miniatura visible
- [ ] **Flyer:** Abrir `/publico/{codigo}` con estado `abierto` → flyer a pantalla completa
- [ ] **Flyer:** Cambiar estado a `calificando` → layout de progreso (sin flyer)
- [ ] **Flyer:** Subir archivo > 2 MB → error de validación
- [ ] **TV toggle:** Crear evento con "No (sin TV)" → DB `tiene_tv_publica = false`
- [ ] **TV toggle:** En administrador: sin URL/código TV, con tabs Publicar/Historial
- [ ] **TV toggle:** En admin: `SeccionToggleTV` visible, `SeccionPantallaPublica` oculta
- [ ] **TV toggle:** Clickear "Activar TV" → secciones reaparecen sin F5
- [ ] **TV toggle:** Abrir `/publico/{codigo}` (sin TV activada) → sigue funcionando
- [ ] **Desempate inline:** Con `tiene_tv_publica = false` y empate → `DesempateInlinePanel` expandible
- [ ] **Desempate inline:** Muestra criterio de desempate, puntajes por criterio, ganador
- [ ] **Desempate inline:** Con `tiene_tv_publica = true` → botones "Mostrar en TV" (sin cambios)

