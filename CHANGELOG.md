# CHANGELOG — Conuro

Registro de cambios y mejoras del sistema de concursos con jurados.

---

## [Sprint 8] — 14 de abril de 2026

### ✨ Características Nuevas

#### UI/UX — Panel Administrador
- **Sidebar sticky en desktop:** El menú lateral ahora permanece fijo al hacer scroll sin desaparecer
  - Clases Tailwind: `lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto`
  - Aplicado a: Todos los paneles (admin, administrador, super)
  - Fallback en móvil: hamburger menu sin cambios

- **Alertas con colores semánticos:**
  - ✅ "Estado en pantalla pública" → `variant="success"` (verde) — indica que hay categorías publicadas
  - ⚠️ "Evento cerrado/publicado" → `variant="warning"` (ámbar) — indica que evento terminó
  - Se agregaron variantes `success` y `warning` en componente `<Alert>`

- **Dashboard del administrador responsivo:**
  - Grid 2 columnas en desktop (`lg:grid-cols-2`)
  - Panel 1 (Sala) + Panel 2 (Avance) → lado a lado
  - Panel 3 (Revisar y publicar) → fila completa (`lg:col-span-2`)
  - Panel 4 (Historial) → fila completa (`lg:col-span-2`)
  - En móvil: columna única (mismo que antes)

### 🐛 Bug Fixes

#### Historial de publicaciones no se actualizaba
**Problema:** Al republicar una categoría, el historial seguía mostrando la fecha y usuario de la PRIMERA publicación, no la última.

**Causa raíz:** En la función SQL `coordinador_avanzar_revelacion_categoria`:
- En modo `simultaneo`, el UPDATE **solo se ejecutaba si** `paso_revelacion < puestos_a_premiar`
- Si la categoría ya estaba completamente revelada, no había UPDATE y no se actualizaba `publicado_at`

**Solución:** Migración `20260414_001_fix_republish_historial.sql`
- Cambió la lógica para **siempre ejecutar el UPDATE** en modo `simultaneo`, incluso si ya está completamente revelado
- Ahora `publicado_at` y `publicado_por` se actualizan cada vez que se publica/avanza la revelación
- El historial refleja correctamente todas las publicaciones con sus fechas y usuarios

**Archivos modificados:**
- `conuro-app/supabase/migrations/20260414_001_fix_republish_historial.sql` (nueva)

#### Pantalla pública no se actualizaba en tiempo real
**Problema:** La pantalla proyector (TV) solo se actualizaba cada 5 segundos (polling), lo que causaba latencia notable al publicar categorías.

**Causa raíz:** `PublicoEventoPage.tsx` NO tenía Realtime subscriptions, solo polling vía `setInterval(cargar(), 5000)`

**Solución:** Agregado Realtime listener para tabla `resultados_publicados`
- Listener Realtime se dispara cuando hay cambios en `resultados_publicados`
- Realtime triggeará refetch inmediata, sin esperar 5 segundos
- Polling cada 5 segundos sigue funcionando como fallback si Realtime falla
- Experiencia en TV: actualizaciones **inmediatas** al publicar

**Archivos modificados:**
- `conuro-app/src/pages/publico/PublicoEventoPage.tsx` (agregado useEffect con listener Realtime, líneas 241-253)

### 📚 Documentación Actualizada

- `CLAUDE.md`: Agregada sección "Cambios Recientes (Sprint 8)"
- `README.md`: Actualizado "Novedades recientes" con información de Sprint 8
- `CHANGELOG.md`: Este archivo (nueva)

---

## [Sprint 7] — Revelación de Podio Escalonada

### ✨ Características Nuevas
- Modo de revelación configurable por evento: `simultaneo` vs `escalonado`
- Paso de revelación por categoría (0 a `puestos_a_premiar`)
- Bloqueo de cambio de categoría cuando revelación escalonada está incompleta
- Visualización del podio parcial según paso de revelación (TV)

### 🔧 Cambios Técnicos
- Migración: `20260413_001_revelacion_podio_escalonada.sql`
- Función SQL: `coordinador_avanzar_revelacion_categoria`, `publico_podio_categoria`
- Campo nuevo: `eventos.modo_revelacion_podio`, `resultados_publicados.paso_revelacion`

---

## [Sprint 6] — Plantillas de Criterios e Importación de Jurados

### ✨ Características Nuevas
- CRUD de plantillas de criterios por organización
- Aplicar plantilla de criterios a evento
- Opción al crear evento: usar plantilla o crear desde cero
- Importación de jurados desde eventos anteriores

---

## [Sprint 5] — Personalización de Pantalla Pública

### ✨ Características Nuevas
- Tema claro/oscuro en pantalla pública
- Color de acento personalizable por evento
- Plantillas de layout público configurable

---

## [Sprint 4] — Jurados sin Auth

### ✨ Características Nuevas
- Login de jurado: código evento (6 caracteres) + nombre, sin cuenta Supabase
- Token de sesión por jurado en tabla `jurados`
- Operaciones jurado vía RPC con token (`jurado_*`)
- Panel privado de calificación secuencial por categoría

---

## [Sprint 3] — MVP Funcional

### ✨ Características Nuevas
- Admin configura eventos, categorías, criterios, participantes
- Jurados califican por criterios
- Administrador publica resultados por categoría
- Pantalla pública con progreso y podio
- Exportación Excel

---

## [Sprint 1-2] — Arquitectura Base

### ✨ Características Nuevas
- Autenticación con Supabase (OTP 8 dígitos)
- Roles: super_admin, admin, administrador, jurado, público
- Multi-tenant por organización
- RLS en Supabase
- Componentes UI base (React + Tailwind v4)
- Flujo de calificación y publicación

---

## Estándares de Documentación

- **Cambios recientes:** Se documentan en `CLAUDE.md` sección "Cambios Recientes"
- **Notas de usuario:** Se agregan al `README.md` bajo "Novedades recientes"
- **Detalles técnicos:** Se documentan en `CHANGELOG.md` (este archivo)
- **Arquitectura y estado:** Se mantiene en `CLAUDE.md`

Cada sprín incluye:
- ✨ Características nuevas
- 🐛 Bug fixes
- 📚 Documentación
- 🔧 Cambios técnicos (migraciones SQL, nuevas funciones, etc.)
