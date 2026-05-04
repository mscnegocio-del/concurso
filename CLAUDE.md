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
| Auth | Supabase Auth — correo + OTP 8 dígitos (admin, coordinador, super_admin) |
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
| Coordinador | Correo + OTP | Progreso, ranking previo, publicar por categoría, Realtime. `/administrador`. |
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

### participantes (Sprint 9+)
`... , institucion text nullable` — institución educativa del participante, mostrada en podios del coordinador y TV pública.

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

### Dashboards de control — Admin y Coordinador (24/04/2026)
- **Sidebar Admin:**
  - ✅ Renombrado "Historial" → **"Historial de eventos"**
  - ✅ Renombrado "Usuarios" → **"Usuarios del sistema"**
  - ✅ Renombrado "Organización" → **"Mi organización"**

- **Dashboard `/admin` — 4 tarjetas principales:**
  - 🎯 **Evento activo:** Solo si está en `abierto`/`calificando` (corrección: antes mostraba último evento cerrado); CTA para crear si no hay activo
  - 📊 **Resumen de eventos:** Total de eventos, eventos realizados, último realizado con fecha
  - 👥 **Participantes y jurados:** Conteo acumulado histórico de la organización
  - 👑 **Plan actual:** Muestra plan, límite de jurados, permiso PDF/Excel

- **Sidebar Coordinador:**
  - ✅ Título del panel: "Panel coordinador" → **"Coordinador de evento"**
  - ✅ Renombrado "Historial" → **"Historial de eventos"**

- **Dashboard `/administrador` — 3 tarjetas principales:**
  - 🎯 **Evento activo con progreso:** Badge de estado, código copiable, barra de avance de calificaciones global (`X/Y`), botón "Ir al panel en vivo"
  - 📌 **Categorías publicadas:** Contador `publicadas/total` con barra, participantes y jurados visibles
  - ⚡ **Acciones rápidas:** Botones a Panel en vivo, Historial de eventos, Abrir pantalla pública (abre en tab nuevo)

- **Cambios de componentes:**
  - ✅ Ampliado `SimplePanel` para aceptar `className` (permite spans de grid dinámico)

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

### UI/UX — Reorganización de Sidebars y Gestión de Usuarios (15/04/2026)

#### Sidebar Admin (`AdminShell.tsx`)
- **Nuevo estructura (6 ítems con iconos lucide-react):**
  1. **Inicio** (LayoutDashboard) → `/admin` — Panel de control con estadísticas
  2. **Historial** (CalendarClock) → `/admin/historial` — Central de eventos CRUD
  3. **Usuarios** (Users) → `/admin/usuarios` — Crear/gestionar coordinadores ✨ NUEVO
  4. **Plantillas de criterios** (FileText) → `/admin/plantillas-criterios`
  5. **Organización** (Building2) → `/admin/organizacion`
  6. **Panel en vivo** (MonitorPlay) → `/admin/coordinacion` — Renombrado de "Coordinación de sala"
- ✅ Eliminado "Gestión del evento" del sidebar (acceso via Historial → Gestionar)
- ✅ Fix: Eliminado duplicado "Inicio" en dashboard (cambiado a "Panel de control")
- ✅ Iconos mejoran la jerarquía visual y distinción entre secciones

#### Sidebar Administrador / Coordinador (`AdministradorShell.tsx`)
- **Nueva estructura (2 ítems con iconos):**
  1. **Inicio** (LayoutDashboard) → `/administrador`
  2. **Historial** (CalendarClock) → `/administrador/historial`
- ✅ Agregados iconos lucide-react

#### Sidebar Super Admin (`SuperShell.tsx`)
- **Nueva estructura (2 ítems con iconos):**
  1. **Organizaciones** (Building2) → `/super`
  2. **Usuarios** (Users) → `/super/usuarios` — Gestión multi-org ✨ NUEVO
- ✅ Agregados iconos lucide-react

#### Gestión de Usuarios — Admin (`AdminUsuariosPage.tsx`) ✨ NUEVO
- **Ruta:** `/admin/usuarios`
- **Funcionalidades:**
  - 📧 **Invitar coordinador:** Email + nombre completo → invitación por email (Supabase Auth)
  - 📋 **Listar usuarios:** Tabla con email, nombre, rol, estado de confirmación
  - 🔄 **Realtime:** Suscripción a cambios en `usuarios` tabla por org (actualización automática)
  - 🗑️ **Eliminar usuario:** Protección contra auto-eliminación; requiere confirmación
  - 🏷️ **Badges de estado:** "Confirmado" (verde) / "Pendiente" (ámbar) según `email_confirmed_at`

#### Gestión de Usuarios — Super Admin (`SuperUsuariosPage.tsx`) ✨ NUEVO
- **Ruta:** `/super/usuarios`
- **Funcionalidades:**
  - 🏢 **Selector de organización:** Dropdown de orgs activas (multiselección para super_admin)
  - 📧 **Invitar usuario:** Email + nombre + rol (`admin` o `administrador`) para cualquier org
  - 📋 **Listar usuarios:** Tabla con email, nombre, rol, estado de confirmación
  - 🔄 **Realtime:** Actualización automática según org seleccionada
  - 🗑️ **Eliminar usuario:** Solo super_admin y admin de misma org
  - 🎯 **Control de permisos:** Super_admin puede crear admin; admin solo puede crear coordinador en su org

#### Edge Function: `invite-user` ✨ NUEVO
- **Archivo:** `supabase/functions/invite-user/index.ts`
- **Autenticación:** JWT token del caller validado
- **Lógica:**
  1. Verifica permisos (admin vs super_admin)
  2. Valida que no exista usuario con ese email
  3. Llama `supabaseAdmin.auth.admin.inviteUserByEmail()` con datos personalizados
  4. Inserta registro en `public.usuarios` con email_confirmed_at NULL (estado pendiente)
  5. Manejo de errores y rollback automático si insert falla
- **Respuesta:** Usuario creado con ID o error descriptivo

#### RPCs nuevas para Usuarios (`20260415_005_admin_usuarios_rpcs.sql`) ✨ NUEVO
- **`admin_eliminar_usuario(p_usuario_id)`:** 
  - Elimina usuario de `auth.users` (cascada a `public.usuarios`)
  - Valida que caller sea admin de misma org o super_admin
  - Protege contra auto-eliminación
  - SECURITY DEFINER para acceso a auth.users
- **`admin_listar_usuarios(p_org_id DEFAULT NULL)`:**
  - Lista usuarios de organización filtrada
  - Incluye estado `email_confirmado` (boolean)
  - Respeta RLS: admin ve su org, super_admin puede filtrar cualquier org
  - SECURITY DEFINER para unir `auth.users` con `public.usuarios`

#### Eliminación de Eventos con Auditoría (`AdminHistorialPage.tsx`)
- ✅ **Nuevo botón "Eliminar"** en tabla (desktop) y tarjetas (mobile)
- ✅ **Solo eventos en estado `borrador`:** Botón deshabilitado con tooltip explicativo
- ✅ **AlertDialog de confirmación:** Aviso de que no se puede deshacer + registro en auditoría
- ✅ **Registro automático en `audit_log`:**
  - Acción: `evento_eliminado`
  - Detalle: nombre, estado del evento
  - Usuario ID y org ID registrados
- ✅ **Limpieza:** Si evento era "en foco", se borra la preferencia localStorage
- ✅ **Toast de éxito** tras eliminación

### Panel en Vivo — Reorganización UX/layout (25/04/2026)

#### Estructura Desktop — Sidebar + Panel Principal
- **Cabecera compacta del evento:** Reemplaza `seccionSala` SimplePanel — una sola línea sticky con nombre, badge de estado con color semántico por estado, código copiable, dot de sync en verde animado, URL + botón "Copiar URL"
- **Sidebar izquierdo `w-56` sticky:** Lista de categorías como navegación primaria
  - Barra de progreso por categoría (fino, suave)
  - Ícono ✓ verde si categoría publicada
  - Expandible para ver progreso detallado por jurado
  - Clic selecciona categoría en panel derecho sin necesidad de tabs
- **Panel principal (flex-1):**
  - **Ranking con podio visual:** Top 3 con badges numéricos `1° 2° 3°` en dorado/plata/bronce sobre fondos tintados; posiciones 4+ como lista compacta
  - **Bloque publicar:** Selector de categoría (removido, ahora vive en sidebar), botón principal + estado escalonado/simultaneo
  - **Empates:** Botones "Mostrar desempate en TV" (si tiene TV) o panel inline con resolver (si no tiene TV)
  - **Historial acordeón:** Colapsado por defecto, badge contador, no ocupa espacio cuando cerrado

#### Estructura Mobile — Tabs Simplificados
- **Eliminado tab "Avance"** (redundante con sidebar desktop)
- **Tabs ahora:** `Publicar | Historial` (antes: `Avance | Publicar | Historial`)
- **Tab Publicar:**
  - Chips de categoría (scrollable horizontal, con badge ✓ si publicada)
  - Ranking + bloque publicar (mismo contenido que desktop)
- **Tab Historial:** Lista de publicaciones por categoría + fecha/usuario

#### CTA "Iniciar Calificación"
- Banner azul índigo prominente cuando `evento.estado === 'abierto'`
- Ícono `Play` + texto descriptivo + botón grande
- Visible ANTES de las alertas (no enterrado)
- Responsive: icono + texto en row (sm+) o column (<sm)

#### Cambios de Color/Semántica
- **Badges de estado:** Color semántico por estado:
  - `borrador` → gris
  - `abierto` → azul índigo
  - `calificando` → azul
  - `cerrado` → ámbar
  - `publicado` → verde
- **Alerta historial publicaciones:** Verde (`variant="success"`)
- **Alerta evento cerrado/publicado:** Ámbar (`variant="warning"`)

#### Archivo Modificado
- **`src/components/coordinacion/CoordinacionSalaPanel.tsx`** — rewrite completo de render section (datos + lógica intactos)

### Gestión de Pantalla Pública Condicional y Cierre de Calificación (27/04/2026)

#### 1. **Botón "Cerrar calificación"** en Panel en Vivo
- **Ubicación:** Cabecera del panel (`CoordinacionSalaPanel`)
- **Visible cuando:** `evento.estado === 'calificando'`
- **Estilos dinámicos:**
  - Verde brillante si **todas las categorías completas** (100% calificaciones)
  - Ámbar si hay **calificaciones pendientes**
- **AlertDialog con confirmación inteligente:**
  - Si todo completo: "¿Cerrar la calificación? Los jurados ya no podrán modificar."
  - Si hay pendientes: Alerta roja destacada + checkbox "Entiendo y deseo cerrar de todos modos"
  - Tooltip con conteo: "X categorías sin completar (Y/Z calificaciones)"
- **Comportamiento:**
  - Transición `calificando` → `cerrado`
  - Toast: "Calificación cerrada. Los jurados verán el aviso automáticamente."
  - Jurados reciben alerta en tiempo real ([JuradoCalificarPage.tsx](conuro-app/src/pages/jurado/JuradoCalificarPage.tsx)) vía Realtime
  - Header se actualiza por Realtime (evento.estado cambia a `cerrado`)

#### 2. **Textos y UI condicionales por `tiene_tv_publica`**
- **Alert "Estado en pantalla pública"** → ocultado cuando sinTV (la información vive en historial)
- **Línea "Modo: revelación escalonada/podio completo"** → ocultada cuando sinTV (no aplica)
- **Texto "Revelación: paso X/Y"** → ocultado cuando sinTV; reemplazado por "Resultados registrados" con color verde
- **Badge de categoría:**
  - Con TV: "Publicada"
  - Sin TV: "Registrada"
- **Tab móvil:**
  - Con TV: "Publicar"
  - Sin TV: "Resultados"
- **Historial:** Título siempre "Historial de resultados" (neutral, no "publicaciones")
- **Archivos modificados:**
  - `src/components/coordinacion/CoordinacionSalaPanel.tsx` (+ imports AlertDialog)
  - `src/pages/admin/AdminHistorialPage.tsx` — ocultar selector "Modo revelación" al crear evento sin TV; forzar `simultaneo` vía hidden input

#### 3. **Gate de pantalla pública por `tiene_tv_publica`** (Seguridad)
- **Nueva migración:** `20260425_001_publico_gate_tiene_tv_publica.sql`
- **Gateadas las 4 RPCs públicas:**
  - `publico_evento_por_codigo` → devuelve vacío si TV apagada
  - `publico_categorias_publicadas` → devuelve vacío si TV apagada
  - `publico_podio_categoria` → devuelve vacío si TV apagada
  - `publico_progreso_por_codigo` → devuelve vacío si TV apagada
- **Comportamiento:**
  - **TV apagada:** `/publico/:codigo` muestra "Evento no encontrado" (ya manejado por frontend)
  - **TV encendida durante evento (opción A):** Datos reaparecen automáticamente vía Realtime; no requiere recargas
  - **Retrocompat:** `coalesce(e.tiene_tv_publica, true)` trata eventos antiguos sin valor como "con TV" (default histórico)
- **Nota:** Las categorías registradas en BD se mantienen (`resultados_publicados`); solo no se exponen vía RPC público cuando TV está apagada

### UX — Historial de Eventos y Renombrado de Rol (28/04/2026)

#### 1. **Formulario "Crear evento nuevo" colapsado por defecto**
- **Cambio en `AdminHistorialPage.tsx`:**
  - ✅ Formulario ahora **oculto por defecto** en `/admin/historial`
  - ✅ Botón `+ Nuevo evento` en la cabecera para mostrar/ocultar el formulario
  - ✅ Al hacer clic, el botón cambia a "Cancelar" (chevron-up)
  - ✅ **Ventaja UX:** Pantalla menos amontonada; los usuarios ven el listado de eventos primero
  - ✅ **Mobile-friendly:** En móvil, el formulario no ocupa espacio por defecto

#### 2. **Eliminación del botón "Inicio" duplicado en sidebars**
- **Cambio en `PanelLayout.tsx`:**
  - ✅ Removida div `px-4 py-3` con enlace hardcodeado a `/` (redundante con ítem "Inicio" en `subNav`)
  - ✅ Ahora solo hay **un "Inicio"** en la navegación lateral (en el menú principal)
  - ✅ Afectó a: `AdminShell`, `AdministradorShell`, `SuperShell`
  - ✅ **Ventaja:** Elimina confusión visual; la navegación es más clara

#### 3. **Renombrado de rol: `administrador` → `coordinador`**
- **Cambio en BD y código (enum `rol_usuario`):**
  - ✅ **Migración SQL:** `20260428_001_rename_rol_administrador_a_coordinador.sql`
    - `ALTER TYPE rol_usuario RENAME VALUE 'administrador' TO 'coordinador'`
    - Las filas existentes en tabla `usuarios` se actualizan automáticamente
  - ✅ **TypeScript:**
    - `src/types/auth.ts`: `RolUsuario = 'super_admin' | 'admin' | 'coordinador'`
    - `src/lib/role-routes.ts`: `case 'coordinador': return '/administrador'`
    - `src/App.tsx`: `RequireRole allowed={['coordinador']}`
    - `src/pages/super/SuperUsuariosPage.tsx`: tipo y `<option value="coordinador">`
    - `src/pages/admin/AdminUsuariosPage.tsx`: `rol: 'coordinador'`
  - ⚠️ **Nota:** Las rutas `/administrador` y nombres de componentes (`AdministradorShell`, etc.) NO cambian — solo el enum value
  - ✅ **Ventaja:** Terminología consistente: "Coordinador de evento" en UI y BD

### Institución Educativa de Participantes (04/05/2026) ✨ NUEVO

#### 1. **Campo institución en tabla participantes**
- **Nueva columna:** `institucion TEXT nullable` en tabla `participantes`
- **Migración:** `20260504_001_add_institucion_to_participantes`
- **Propósito:** Registrar la institución educativa a la que pertenece cada participante para mostrar en podios

#### 2. **Formulario de Participantes actualizado**
- **Cambio en `AdminEventoPage.tsx` (SeccionParticipantes):**
  - ✅ Nuevo campo de entrada "Institución (opcional)" junto a "Nombre completo"
  - ✅ Campo opcional; si está vacío, no se guarda en BD (NULL)
  - ✅ Se muestra en la lista de participantes como texto pequeño entre paréntesis
  - ✅ Tipo `Participante` actualizado: `institucion?: string | null`
  - ✅ Actualización: Se envía junto con el insert al guardar nuevo participante

#### 3. **Podio del Coordinador**
- **Cambio en `CoordinacionSalaPanel.tsx`:**
  - ✅ Tipo `RankFila` ahora incluye `institucion?: string | null`
  - ✅ Si el participante tiene institución, se muestra bajo el nombre en texto pequeño (`text-xs`)
  - ✅ Aparece en Top 3 (con badges de medallas) y posiciones 4+ (en lista compacta)
  - ✅ Color `text-muted-foreground` para no competir con nombre/puntaje
  - ✅ Espaciado vertical ajustado: `gap-1` en contenedor de medalla, `ml-10` en institucion

#### 4. **Pantalla Pública (TV)**
- **Cambio en `PublicoEventoPage.tsx` (PodioSlot):**
  - ✅ Tipo `PodioFila` actualizado: `institucion?: string | null`
  - ✅ Función `normalizarFilasPodio` extrae institucion de datos RPC
  - ✅ Si existe, se renderiza bajo el nombre en tamaño responsivo
  - ✅ Tamaño: `text-[clamp(0.5rem,1.2vmin,0.65rem)]` — escala con pantalla
  - ✅ Color: `text-[var(--publico-text-muted)]` — coherente con tema

#### 5. **RPCs actualizadas**
- **Migración:** `20260504_002_update_rpc_include_institucion_v2`
  - ✅ **`coordinador_ranking_categoria`:** Ahora retorna `institucion` en result set
  - ✅ **`publico_podio_categoria`:** Ahora retorna `institucion` en result set
  - ✅ Ambas RPC: DROP + CREATE para cambiar tipo de retorno (OUT parameters)
  - ✅ RPC público mantiene gate: no retorna datos si `tiene_tv_publica = false`

#### 6. **Flujo de datos**
```
Admin ingresa institución → Supabase `participantes.institucion`
  ↓
RPC devuelve institucion → Frontend recibe en RankFila / PodioFila
  ↓
Coordinador Panel muestra: "Nombre (Institución)"
TV Pública muestra: "Nombre" + subtítulo pequeño "Institución"
```

---

## Notas de desarrollo

- Mobile-first en panel jurado; pantalla pública pensada para 1080p.
- Cambios de estado críticos y reabrir calificaciones: ideal **Edge Function** con validación server-side (parcialmente cubierto por RPC definer + RLS).
- **Realtime ahora en:** coordinador (`CoordinacionSalaPanel` para `eventos` y `resultados_publicados`), administrador, jurado (detección cierre `calificando`→`cerrado`), público TV (`PublicoEventoPage`).
- **PDF profesional:** Soporta multi-página con paginación automática; metadatos completos; tabla de resultados con estilos alternados.
