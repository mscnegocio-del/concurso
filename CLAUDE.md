# CLAUDE.md — Sistema de Calificación para Concursos con Jurados - ConcursoApp


## Descripción del proyecto

Sistema web multi-tenant, responsivo y en tiempo real para gestionar concursos institucionales evaluados por jurado (Poder Judicial del Perú). Permite crear eventos, inscribir participantes, calificar en tiempo real por múltiples jurados, publicar resultados con podio en proyector y exportar ranking oficial (Excel / PDF según plan).

**Código de la app:** `conuro-app/` (React + Vite). **Migraciones SQL:** `conuro-app/supabase/migrations/`.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS v4 (mobile-first) |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth — correo + OTP 8 dígitos (admin, administrador, super_admin) |
| Jurado | Sin cuenta Supabase: sesión por `token_sesion` en `jurados` + `sessionStorage` |
| Tiempo real | Supabase Realtime (`eventos`, `resultados_publicados`) + polling de progreso vía RPC |
| Storage | Supabase Storage (logos en `organizaciones`) |
| Deploy | Vercel (previsto) |
| Pagos | Lemon Squeezy (webhook esqueleto en `supabase/functions/lemon-webhook`) |
| PDF | @react-pdf/renderer (carga dinámica) |
| Excel | SheetJS (`xlsx`, carga dinámica) |
| Tests | Vitest (`ranking`, `planes`) |

---

## Roles y acceso

| Rol | Método de acceso | Permisos |
|-----|-----------------|----------|
| Super Admin | Correo + OTP | CRUD de **organizaciones** (nombre, slug, plan, activo). RLS dedicado. Panel `/super`. |
| Admin | Correo + OTP | Evento actual (último por `created_at`), CRUD categorías/criterios/participantes/jurados, estados, historial, clonar evento, exportaciones. `/admin/evento`, `/admin/historial`. |
| Administrador | Correo + OTP | Progreso, ranking previo, publicar por categoría, Realtime. `/administrador`. |
| Jurado | Código evento (6 caracteres) + nombre | Calificación secuencial; RPC `jurado_*` con token. `/jurado`, `/jurado/panel/...`. |
| Público | Sin login | `/publico/<codigo_acceso>` — progreso sin notas; podio solo si la categoría está en `resultados_publicados`. |

> **Alta de usuarios:** Super Admin y Admin siguen requiriendo filas en `auth.users` + `usuarios` (vinculación manual o flujos futuros). El Super Admin **no** crea usuarios admin desde la UI; solo la organización.

---

## Arquitectura multi-tenant

- Raíz: `organizaciones` (`plan`, `slug`, `logo_url`, `logo_subsede_url`, `activo`).
- RLS por `organizacion_id` en datos de evento.
- Super Admin: políticas `org_insert_super_admin` / `org_update_super_admin` sobre `organizaciones`.
- Público: sin lectura directa amplia de `resultados_publicados` para `anon`; datos vía RPC `SECURITY DEFINER` (`publico_*`).

---

## Modelo de negocio y límites en la app

| Plan | Límites aplicados en código |
|------|----------------------------|
| **gratuito** | Máx. **3 jurados** por evento (panel admin). **Sin exportación PDF** (Excel sí). |
| **basico** / **institucional** | Sin tope de jurados en UI; PDF + Excel si el evento está cerrado o publicado. |

Lógica en `conuro-app/src/lib/planes.ts`. El plan lo cambia el Super Admin en `/super`.

---

## Schema de base de datos (resumen)

### organizaciones
`id, nombre, slug, logo_url, logo_subsede_url, plan, activo, created_at`

### usuarios
`id` (FK `auth.users`), `organizacion_id`, `email`, `rol` (`super_admin` | `admin` | `administrador`), `nombre_completo`, `created_at`

### eventos
`id, organizacion_id, nombre, descripcion, fecha, estado, codigo_acceso (6 chars, único), puestos_a_premiar (2|3), plantilla_criterios_id, plantilla_publica, color_accento_hex, modo_revelacion_podio, created_at`  
Índice único parcial: un solo evento en `abierto` o `calificando` por organización.

### criterios, categorias, participantes, jurados, calificaciones, resultados_publicados, audit_log
Como en el diseño original, con estas extensiones:

### jurados (Sprint 3+)
`... , token_sesion uuid UNIQUE` — rota en cada login vía `registrar_o_buscar_jurado`; las operaciones del panel jurado usan RPC con el token.

### resultados_publicados (Sprint 7+)
`... , paso_revelacion int` — en modo escalonado controla cuántos puestos ya son visibles en TV (`0..puestos_a_premiar`).

---

## RPCs y funciones SQL destacadas

| Área | Función | Uso |
|------|---------|-----|
| Jurado | `registrar_o_buscar_jurado`, `jurado_resolver_sesion`, `jurado_listar_*`, `jurado_obtener_mis_calificaciones`, `jurado_guardar_calificacion` | Login y calificación sin exponer notas de otros |
| Público | `publico_evento_por_codigo`, `publico_progreso_por_codigo`, `publico_categorias_publicadas`, `publico_podio_categoria` | Proyector; podio solo si la categoría fue publicada y según `paso_revelacion` |
| Coordinador | `coordinador_progreso_evento`, `coordinador_ranking_categoria`, `coordinador_resultados_publicados_lista`, `coordinador_avanzar_revelacion_categoria` | Panel administrador/auth con publicación simultánea o escalonada. **[MEJORADO en 20260414_001]** Ahora actualiza `publicado_at` y `publicado_por` al republicar una categoría, incluso si ya está completamente revelada. |
| Admin | `admin_clonar_evento(p_evento_origen_id)`, `admin_aplicar_plantilla_criterios`, `admin_copiar_jurados_evento` | Clonado de evento, plantillas de criterios, importación de jurados |
| Interno | `_admin_o_super_puede_org`, `_puntajes_finales_categoria` (uso interno desde funciones definer) | Autorización y cálculos |

Migraciones versionadas en `conuro-app/supabase/migrations/` (incl. `20260410_001` … `20260414_001`).

---

## Reglas de negocio (calificación y empates)

- Puntaje final por participante: para cada jurado, suma de criterios; luego **promedio entre jurados**.
- **Desempate** (implementado en `src/utils/ranking.ts` + tests): primero promedio en el criterio `es_criterio_desempate`, luego resto de criterios en **orden** de configuración.
- Jurado: orden secuencial de participantes en UI.
- Edición de notas: coherente con estado del evento (`calificando` vs `cerrado`) vía RPC y políticas.

---

## Rutas principales (frontend)

| Ruta | Descripción |
|------|-------------|
| `/` | Home / redirección por rol |
| `/login` | OTP admin / administrador / super_admin |
| `/admin/evento` | Configuración del evento más reciente de la org |
| `/admin/historial` | Lista de eventos, **Clonar**, crear con modo de revelación y plantilla opcional |
| `/admin/plantillas-criterios` | CRUD de plantillas de criterios |
| `/administrador` | Coordinación y publicación |
| `/super` | Organizaciones (super admin) |
| `/jurado`, `/jurado/panel`, `/jurado/panel/categoria/:categoriaId`, `/jurado/panel/categoria/:categoriaId/participante/:participanteId` | Jurado |
| `/publico/:eventoSlug` | `eventoSlug` = **`codigo_acceso`** del evento (6 caracteres) |

---

## Pantallas implementadas (resumen)

1. **Admin:** cabecera evento, categorías, criterios, participantes, jurados, transición de estados, exportación Excel/PDF, historial y clonado, **toggle TV pública**, **upload flyer**.
2. **Administrador:** progreso, ranking previo, publicar categoría, historial de publicaciones, Realtime + polling, **desempate inline (sin TV)**.
3. **Jurado:** dashboard por categoría, lista secuencial, formulario por criterios.
4. **Público:** progreso global y por categoría; última categoría publicada con podio; sonido al nueva publicación; tema claro/oscuro + acento; modo de podio simultáneo o escalonado; **flyer a pantalla completa en estado abierto**.
5. **Super:** listado y alta de organizaciones; plan y activo.

Pendientes de producto / refinamiento: reabrir notas solo vía Edge Function (recomendación de arquitectura), confirmación explícita “¿Seguro?” antes de guardar notas del jurado (mejora UX), completar robustez productiva del webhook de Lemon (firma + plan).

---

## Exportación

- **Excel:** hojas por categoría + hoja **Resumen**; nombres `NombreEvento_YYYY-MM-DD.xlsx`.
- **PDF:** acta con logos (URLs), jurados, ganadores por categoría; mismo patrón de nombre `.pdf`.
- Motor de ranking en cliente alineado a reglas de desempate (`rankingPorCategoria`).

---

## Variables de entorno (`conuro-app/.env`)

```env
VITE_APP_URL=http://localhost:5173
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # scripts / Edge Functions, no obligatorio solo para frontend
LEMON_SQUEEZY_API_KEY=
LEMON_SQUEEZY_WEBHOOK_SECRET= # al activar webhook en producción
```

---

## Estructura real de carpetas (`conuro-app/src`)

```
src/
├── components/
│   ├── acta/           # ActaConcursoPdf (react-pdf)
│   ├── layouts/
│   ├── routing/
│   └── ErrorBoundary.tsx
├── contexts/           # auth, jurado
├── hooks/
├── lib/                # supabase, audit, codigo-evento, planes, excel-export, acta-pdf-download, export-filename
├── pages/
│   ├── admin/          # AdminEventoPage, AdminHistorialPage, AdminExportaciones, AdminShell
│   ├── administrador/
│   ├── jurado/
│   ├── publico/
│   ├── super/
│   └── ...
├── types/
└── utils/              # ranking.ts (+ ranking.test.ts)
```

Tests: `src/lib/planes.test.ts`, `src/utils/ranking.test.ts` — `npm run test` (config `vitest.config.ts`).

---

## Seguridad

- RLS en tablas sensibles; jurado por RPC; público sin filtrar `calificaciones` directamente.
- `audit_log` insert desde cliente en acciones relevantes (p. ej. creación evento, cambio estado, publicación).
- Webhook Lemon: función Edge es **esqueleto**; en producción validar firma y actualizar `plan`.

---

## Cómo correr en local

```bash
cd conuro-app
npm install
# Copiar .env.example → .env y completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

Abrir la URL que muestra Vite (típicamente `http://localhost:5173`).

---

## Estado operativo del entorno (referencia — actualizar según tu avance)

Configuración ya hecha en Supabase / Auth (ejemplo):

- [x] Usuario **super_admin** creado manualmente (`auth.users` + `usuarios.rol = super_admin`).
- [x] **Organización** creada (desde `/super` o SQL).
- [x] Usuario **admin** de esa organización + **evento** en borrador (o siguiente estado).

**Siguiente paso típico en el flujo MVP:** en `/admin/evento` completar **criterios de calificación** (al menos uno, con opcional criterio de desempate), **categorías**, **participantes** por categoría y **jurados**; luego validar transición **borrador → abierto** (el asistente valida criterios, jurados, categorías y al menos un participante por categoría).

---

## Repositorio y Supabase (referencia)

- Repo: `https://github.com/mscnegocio-del/concurso` (nombre puede variar en el remoto actual).
- Proyecto Supabase de referencia en documentación histórica: `https://becqprcmjxpwiwgflvoj.supabase.co` — usar siempre el URL del proyecto donde apliques migraciones.

---

## Cambios Recientes (Sprint 8 — Abril 2026)

### UI/UX — Panel Administrador (14/04/2026)
- **Sidebar sticky en desktop:** El menú lateral ahora permanece fijo al hacer scroll (`lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto`)
- **Alertas con colores semánticos:** 
  - "Estado en pantalla pública" → `variant="success"` (verde)
  - "Evento cerrado/publicado" → `variant="warning"` (ámbar)
- **Dashboard responsivo:** Grid 2 columnas en desktop (Sala + Avance lado a lado; Revisar y publicar + Historial full-width)

### Funcionalidad — Historial y Pantalla Pública (14/04/2026)
- **Migración `20260414_001_fix_republish_historial.sql`:**
  - ✅ Arregló bug: `coordinador_avanzar_revelacion_categoria` ahora siempre actualiza `publicado_at` y `publicado_por` al republicar en modo simultáneo
  - ✅ El historial ahora refleja la ÚLTIMA publicación, no solo la primera
  
- **Realtime en pantalla pública:**
  - ✅ `PublicoEventoPage.tsx`: Agregado listener Realtime para `resultados_publicados`
  - ✅ La pantalla proyector se actualiza en **tiempo real** (no espera 5 segundos de polling)
  - ✅ El polling cada 5 segundos funciona como fallback si Realtime falla

### PDF — Acta de Resultados (15/04/2026)
- **Mejoras de diseño implementadas en `ActaConcursoPdf.tsx`:**
  - ✅ **Logos centrados:** 110×70 px, con separador vertical (1px) cuando hay ambos logos
  - ✅ **Jerarquía visual mejorada:** Línea divisoria azul marino; nombre organización 13pt, título evento 17pt bold
  - ✅ **Metadatos en línea:** Fecha, código de acceso (mayúsculas), temática en fila única con espaciado
  - ✅ **Sección Criterios de evaluación:** Nueva sección con lista numerada, fondo azul claro (`sectionHeader`)
  - ✅ **Rankings como tabla:** Columnas Puesto/Participante/Código/Puntaje; filas alternadas con fondo gris; total de participantes por categoría
  - ✅ **Firmas individuales:** Grid de 2 columnas, línea de firma por jurado con nombre y rol
  - ✅ **Paginación:** Footer fijo con "Página N de M" usando `pageNumber` y `totalPages`
- **Parámetros ampliados:** `codigoAcceso` y `criteriosNombres` ahora pasados a componente PDF

### UX — Pantalla Pública (15/04/2026)
- **Indicador de estado de conexión (esquina superior derecha):**
  - 🟢 Verde — "Conectado" (Realtime activo)
  - 🟡 Ámbar — "Sincronizando" (polling cada 5s, Realtime desconectado)
  - 🔴 Rojo — "Sin conexión" (>10s sin sincronización)
  - Muestra timestamp: "Actualizado hace 2s" en pequeño
  - Se detecta automáticamente según estado de listener Realtime (`connectionStatus`, `lastSyncedAt`)

- **Transición suave del podio:**
  - Fade + scale suave (0.65s, `cubic-bezier(0.22, 1, 0.36, 1)` — easeOut)
  - Antes: aparecía bruscamente
  - Respeta `prefers-reduced-motion` para accesibilidad
  - Implementado en keyframe `publico-podium-enter` con fallback para navegadores sin soporte

- **Indicador de modo escalonado visible:**
  - Badge debajo de "Última revelación": "Paso X/Y — Revelación progresiva"
  - Color ámbar si `revelaciónEnProgreso` (paso < puestos_a_premiar)
  - Color verde si completada (paso == puestos_a_premiar)
  - Solo aparece en modo escalonado cuando hay categorías publicadas

### Configuración Flexible — Flyer, TV Pública y Desempate (15/04/2026)

#### 1. **Flyer / Imagen del evento**
- **Nueva columna:** `flyer_url text nullable` en tabla `eventos`
- **Storage:** Bucket `eventos-flyers` con políticas RLS (`admin`, `super_admin` solo de su org)
- **Admin:** Sección nueva en `AdminEventoPage.tsx` para subir (JPEG/PNG/WebP, máx 2 MB), ver miniatura y quitar
- **Pantalla pública:** Muestra flyer a pantalla completa **solo cuando estado = `abierto`** (sala de espera visual)
  - Estados `calificando`, `cerrado`, `publicado` muestran layout tradicional de progreso + podio
- **Archivo:** `src/pages/publico/PublicoEventoPage.tsx` renderiza flyer condicional

#### 2. **Toggle "¿Tiene pantalla pública?"**
- **Nueva columna:** `tiene_tv_publica boolean NOT NULL default true` en tabla `eventos`
- **Creación:** Formulario en `AdminHistorialPage.tsx` pregunta "Sí (con TV)" / "No (sin TV)" — default: Sí
- **Admin:** Nueva sección `SeccionToggleTV` permite activar/desactivar desde admin sin F5
  - Si desactivada, oculta `SeccionPantallaPublica` (modos, plantilla, color)
- **Administrador:** 
  - Si `tiene_tv_publica = false`: panel Sala oculta URL/Código TV, muestra aviso descriptivo
  - Tabs "Publicar" e "Historial" **se mantienen visibles** (publicar = registrar resultados sin importar TV)
  - Botón "Publicar" cambia label a "Registrar resultados de categoría"
- **Pantalla pública:** `/publico/:codigo` **sigue funcionando** aunque `tiene_tv_publica = false` (la columna es solo para control admin)
- **Archivos:** `AdminHistorialPage.tsx`, `AdminEventoPage.tsx`, `AdministradorEventoPage.tsx`, `CoordinacionSalaPanel.tsx`

#### 3. **Desempate visible sin TV**
- **Nuevo componente:** `DesempateInlinePanel.tsx` (inline, sin overlay, expandible por lugar)
- **Cuando `tiene_tv_publica = false` y hay empates:**
  - Panel inline en sección "Publicar" con datos: criterio de desempate, puntaje por criterio, ganador
  - Muestra quién gana en el criterio de desempate (mayor puntaje = ganador)
  - Si no hay criterio de desempate: muestra aviso de "resolución manual"
- **Cuando `tiene_tv_publica = true`:** mantiene botones "Mostrar/Ocultar en TV" originales sin cambios
- **Datos:** Reutiliza `empatesDetectados` y `criterios` ya calculados en `CoordinacionSalaPanel`
- **Archivo:** `src/components/coordinacion/DesempateInlinePanel.tsx`

#### Migración SQL
- **Archivo:** `supabase/migrations/20260415_004_flyer_y_tv_publica.sql`
- Columnas, bucket, políticas RLS y RPC `publico_evento_por_codigo` actualizada
- **Retrocompatibilidad:** `default true` y `default null` garantizan eventos existentes no afectados

---

## Notas de desarrollo

- Mobile-first en panel jurado; pantalla pública pensada para 1080p.
- Cambios de estado críticos y reabrir calificaciones: ideal **Edge Function** con validación server-side (parcialmente cubierto por RPC definer + RLS).
- **Realtime ahora en:** coordinador (`CoordinacionSalaPanel`), administrador (implícito), público TV (`PublicoEventoPage`).
- **PDF profesional:** Soporta multi-página con paginación automática; metadatos completos; tabla de resultados con estilos alternados.
