# Plan de Implementación — Sistema de Concurso de Dibujo y Pintura
## Por fases detalladas

---

## Actualización de estado real (Abr 2026)

Este plan contiene histórico de fases; para ejecución actual considerar además:

- Ya está implementado en producción de código:
  - plantillas de criterios (CRUD + aplicar + opción al crear evento),
  - importación de jurados entre eventos,
  - pantalla pública con tema/acento,
  - revelación de podio por evento (`simultaneo`/`escalonado`) con bloqueo de cambio de categoría mientras la revelación quede incompleta.
- Migraciones recientes relevantes:
  - `20260410_008_evento_plantilla_publica.sql`
  - `20260410_009_admin_plantillas_jurados_rpc.sql`
  - `20260413_001_revelacion_podio_escalonada.sql`

### Hallazgos / warnings técnicos detectados en código

- Build genera warning de chunks grandes en frontend (`index` y `acta-pdf-download`), sin fallo de compilación.
- El webhook Lemon Squeezy sigue como esqueleto para producción (pendiente validación estricta de firma + transición final de `plan`).
- UAT E2E final sigue siendo necesario para marcar cierre operativo completo (sobre todo flujos con múltiples categorías/jurados y estado `cerrado` + publicación escalonada).

---

## FASE 0 — Setup y configuración base
**Duración estimada: 1 día**

### 0.1 Repositorio y proyecto
- [x] Crear repositorio en GitHub (`https://github.com/mscnegocio-del/concurso`)
- [ ] Inicializar proyecto con Vite + React 18 + TypeScript
- [ ] Configurar Tailwind CSS v4
- [ ] Configurar ESLint + Prettier
- [ ] Configurar estructura de carpetas según CLAUDE.md
- [ ] Crear archivo `.env.example` con todas las variables necesarias
- [ ] Configurar path aliases en `vite.config.ts` (`@/` → `src/`)

### 0.2 Supabase
- [x] Crear proyecto en Supabase (`https://becqprcmjxpwiwgflvoj.supabase.co`)
- [x] Configurar Auth: habilitar OTP por email, configurar longitud a 8 dígitos
- [ ] Configurar Storage bucket: `logos` (público)
- [ ] Instalar `@supabase/supabase-js`
- [ ] Crear `src/lib/supabase.ts` con cliente tipado

### 0.3 Vercel
- [ ] Conectar repositorio a Vercel
- [ ] Configurar variables de entorno en Vercel
- [ ] Configurar dominio
- [ ] Verificar deploy automático en push a `main`

### 0.4 Dependencias base
```bash
# UI y utilidades
npm install @headlessui/react lucide-react clsx tailwind-merge
# Estado global
npm install zustand
# Formularios
npm install react-hook-form zod @hookform/resolvers
# Routing
npm install react-router-dom
# Fechas
npm install date-fns
# PDF
npm install @react-pdf/renderer
# Excel
npm install xlsx
# Sonido
npm install howler @types/howler
# Pagos
npm install @lemonsqueezy/lemonsqueezy.js
```

---

## FASE 1 — Base de datos (Schema Supabase)
**Duración estimada: 1 día**

### 1.1 Tablas principales
- [ ] Crear tabla `organizaciones`
- [ ] Crear tabla `usuarios` con enum de roles
- [ ] Crear tabla `eventos` con enum de estados
- [ ] Crear tabla `categorias`
- [ ] Crear tabla `participantes`
- [ ] Crear tabla `jurados`
- [ ] Crear tabla `criterios`
- [ ] Crear tabla `calificaciones` con unique constraint
- [ ] Crear tabla `plantillas_criterios`
- [ ] Crear tabla `plantilla_criterios_items`
- [ ] Crear tabla `resultados_publicados`
- [ ] Crear tabla `audit_log`

### 1.2 Constraints y relaciones
- [ ] Foreign keys con CASCADE donde corresponda
- [ ] Unique: un evento activo por organización
- [ ] Unique: (jurado_id, participante_id, criterio_id) en calificaciones
- [ ] Check: puntaje dentro del rango (0 a puntaje_maximo del criterio)
- [ ] Check: estados del evento en secuencia válida

### 1.3 Row Level Security (RLS)
- [ ] Habilitar RLS en todas las tablas
- [ ] Política `organizaciones`: solo miembros de esa org
- [ ] Política `usuarios`: admin ve su org, super_admin ve todo
- [ ] Política `eventos`: por organizacion_id
- [ ] Política `calificaciones`: jurado solo ve/edita las suyas
- [ ] Política `resultados_publicados`: lectura pública si publicado
- [ ] Política `audit_log`: solo insert, lectura solo admin

### 1.4 Funciones y vistas SQL
- [ ] Vista `v_puntajes_participante`: suma por jurado por participante
- [ ] Vista `v_promedio_participante`: promedio entre jurados
- [ ] Vista `v_ranking_categoria`: ranking con desempate aplicado
- [ ] Función `calcular_ganadores(evento_id)`: retorna top N por categoría
- [ ] Función `progreso_evento(evento_id)`: retorna % completado por jurado
- [ ] Trigger `audit_calificaciones`: registra cambios en audit_log
- [ ] Trigger `validar_evento_unico`: bloquea si ya hay evento activo

### 1.5 Realtime
- [ ] Habilitar Realtime en tabla `calificaciones`
- [ ] Habilitar Realtime en tabla `resultados_publicados`
- [ ] Habilitar Realtime en tabla `eventos` (cambios de estado)

### 1.6 Seed inicial
- [ ] Insertar organización demo
- [ ] Insertar super admin
- [ ] Insertar plantilla de criterios de ejemplo (Creatividad, Diseño, Presentación)

---

## FASE 2 — Autenticación y routing
**Duración estimada: 1 día**

### 2.1 Sistema de rutas
- [x] Configurar React Router con rutas protegidas
- [x] Estructura de rutas:
  ```
  /                          → Redirect según rol
  /login                     → Login admin/administrador
  /jurado                    → Ingreso jurado (código + nombre)
  /publico/:evento_slug      → Pantalla pública (sin auth)
  /admin/*                   → Panel admin (protegido)
  /administrador/*           → Panel administrador (protegido)
  /super/*                   → Panel super admin (protegido)
  ```
- [x] Guard de ruta por rol
- [x] Redirect automático si ya está autenticado

### 2.2 Login Admin / Administrador
- [ ] Pantalla de login con logo PJ
- [x] Campo email + botón "Enviar OTP"
- [x] Pantalla de ingreso OTP (8 dígitos, input auto-focus por dígito)
- [x] OTP con expiración visual (countdown)
- [x] Reenviar OTP
- [x] Manejo de errores (OTP inválido, expirado)
- [x] Guardar sesión en localStorage via Supabase

### 2.3 Ingreso Jurado
- [x] Pantalla: ingresar código del evento
- [x] Validar código contra tabla `eventos` (estado debe ser "abierto" o "calificando")
- [x] Si válido: mostrar nombre del evento y campo nombre completo
- [x] Buscar o crear registro en tabla `jurados`
- [x] Guardar sesión de jurado en sessionStorage (no usa Supabase Auth)
- [x] Redirect a panel jurado

### 2.4 Contexto de autenticación
- [x] Hook `useAuth()` con usuario actual, rol, organizacion_id
- [x] Hook `useJurado()` con datos del jurado activo
- [x] Logout con limpieza de sesión

---

## FASE 3 — Panel Super Admin
**Duración estimada: 1 día**

### 3.1 Dashboard super admin
- [ ] Listado de organizaciones activas
- [ ] Métricas globales (total eventos, total calificaciones)

### 3.2 Gestión de organizaciones
- [ ] Crear organización (nombre, slug, plan)
- [ ] Subir logo PJ y logo subsede
- [ ] Crear usuario Admin para la organización
- [ ] Activar / desactivar organización
- [ ] Ver historial de eventos de cada organización

### 3.3 Gestión de planes
- [ ] Asignar plan a organización
- [ ] Ver estado de suscripción (Lemon Squeezy webhook)

---

## FASE 4 — Panel Admin (núcleo del sistema)
**Duración estimada: 3-4 días**

### 4.1 Dashboard admin
- [ ] Resumen del evento activo (estado, progreso, categorías)
- [ ] Accesos rápidos a cada sección
- [ ] Indicador en tiempo real: cuántos jurados terminaron por categoría (Supabase Realtime)

### 4.2 Gestión de plantillas de criterios
- [ ] Listar plantillas existentes
- [ ] Crear plantilla: nombre + lista de criterios (nombre, puntaje máximo, orden)
- [ ] Marcar cuál criterio es el de desempate
- [ ] Editar plantilla (mientras no esté en uso en evento activo)
- [ ] Eliminar plantilla
- [ ] Clonar plantilla

### 4.3 Gestión de eventos
- [ ] Listar todos los eventos (activo + históricos)
- [ ] Crear evento:
  - [ ] Nombre, descripción, fecha
  - [ ] Puestos a premiar (2 o 3)
  - [ ] Seleccionar plantilla de criterios (o crear criterios manual)
  - [ ] Definir criterio de desempate
  - [ ] Generar código de acceso (6 caracteres alfanumérico)
- [ ] Ver detalle de evento
- [ ] Editar evento (solo en estado "Borrador")
- [ ] Clonar evento (copia categorías + criterios, sin participantes)
- [ ] Cambiar estado del evento con confirmación
- [ ] Regenerar código de acceso del evento
- [ ] Ver código QR del evento para jurados

### 4.4 Gestión de categorías
- [ ] Listar categorías del evento activo
- [ ] Crear categoría (nombre, orden)
- [ ] Editar categoría
- [ ] Reordenar categorías (drag and drop o flechas)
- [ ] Eliminar categoría (solo si no tiene participantes)

### 4.5 Gestión de participantes
- [ ] Listar participantes por categoría
- [ ] Agregar participante (nombre completo) — asigna código automático (01, 02...)
- [ ] Editar nombre de participante
- [ ] Eliminar participante (solo si no tiene calificaciones)
- [ ] Ver total de participantes por categoría

### 4.6 Gestión de jurados
- [ ] Listar jurados registrados para el evento
- [ ] Agregar jurado (nombre completo)
- [ ] Reordenar jurados
- [ ] Eliminar jurado (solo en estado "Borrador" o "Abierto")
- [ ] Ver progreso de cada jurado en tiempo real

### 4.7 Gestión de criterios del evento
- [ ] Listar criterios (ya cargados desde plantilla)
- [ ] Editar puntaje máximo por criterio
- [ ] Cambiar criterio de desempate
- [ ] Reordenar criterios

### 4.8 Control de estado del evento
- [ ] Botón "Activar evento" (Borrador → Abierto) con validaciones:
  - Mínimo 1 categoría
  - Mínimo 1 participante por categoría
  - Mínimo 1 jurado
  - Mínimo 1 criterio
- [ ] Botón "Iniciar calificación" (Abierto → Calificando)
- [ ] Botón "Cerrar calificación" (Calificando → Cerrado) con confirmación
- [ ] Botón "Reabrir calificación" (Cerrado → Calificando) con campo motivo → audit_log
- [ ] Botón "Publicar resultados" (Cerrado → Publicado)

### 4.9 Audit log
- [ ] Tabla paginada de todas las acciones del evento
- [ ] Filtrar por: usuario, jurado, tipo de acción, fecha
- [ ] Detalle de cada entrada (qué cambió, valor anterior, valor nuevo)

### 4.10 Configuración de organización
- [ ] Editar nombre e información
- [ ] Subir/cambiar logo PJ
- [ ] Subir/cambiar logo subsede
- [ ] Gestionar usuarios administradores (crear, desactivar)

---

## FASE 5 — Panel Administrador
**Duración estimada: 1 día**

### 5.1 Dashboard administrador
- [ ] Vista del evento activo (nombre, estado, fecha)
- [ ] Progreso en tiempo real por categoría:
  - Cuántos jurados completaron esa categoría
  - Barra de progreso visual
  - Actualización sin recarga (Supabase Realtime)

### 5.2 Vista de resultados en vivo
- [ ] Ranking en tiempo real por categoría (antes de publicar al público)
- [ ] Puntaje por participante con desglose por jurado
- [ ] Indicador de empates detectados

### 5.3 Control de pantalla pública
- [ ] Selector de categoría a mostrar en proyector
- [ ] Botón "Publicar resultados de esta categoría"
  - [ ] Confirmación previa
  - [ ] Al confirmar: actualiza `resultados_publicados` → dispara evento en Realtime
  - [ ] La pantalla pública reacciona automáticamente
- [ ] Ver qué categorías ya fueron publicadas

---

## FASE 6 — Panel Jurado (mobile-first)
**Duración estimada: 2 días**

### 6.1 Pantalla de inicio de sesión jurado
- [ ] Campo código de evento (mayúsculas automáticas)
- [ ] Campo nombre completo
- [ ] Validación en tiempo real
- [ ] Mensaje de error claro si código inválido o evento no está en estado correcto

### 6.2 Dashboard jurado
- [ ] Bienvenida con nombre del jurado y nombre del evento
- [ ] Lista de categorías a calificar
- [ ] Indicador de progreso por categoría (X de Y participantes calificados)

### 6.3 Lista de participantes (por categoría)
- [ ] Listado ordenado por código (01, 02, 03...)
- [ ] Indicador visual por participante:
  - ✅ Verde: ya calificado
  - ⏳ Amarillo: en progreso
  - ⬜ Gris: pendiente
- [ ] Solo puede entrar al siguiente si el anterior está completo (secuencial)
- [ ] Participante actual destacado visualmente

### 6.4 Formulario de calificación
- [ ] Un criterio por sección visible
- [ ] Slider + input numérico sincronizados (0 a puntaje_máximo)
- [ ] Puntaje acumulado visible en tiempo real mientras completa
- [ ] Validación: todos los criterios deben tener puntaje antes de confirmar
- [ ] Botón "Confirmar calificación" con modal de confirmación:
  - Muestra resumen de puntajes ingresados
  - "¿Estás seguro de estas notas?"
  - Botones: Editar / Confirmar
- [ ] Al confirmar: guarda en Supabase, avanza al siguiente participante
- [ ] Permitir editar notas mientras evento esté en "Calificando"

### 6.5 Estado finalizado
- [ ] Pantalla de "Has calificado a todos los participantes"
- [ ] Resumen de calificaciones realizadas (solo las propias)
- [ ] Opción de revisar y editar (mientras evento en "Calificando")

---

## FASE 7 — Pantalla pública / proyector
**Duración estimada: 1.5 días**

### 7.1 Routing público
- [ ] URL: `/publico/:evento_slug` — sin autenticación
- [ ] Detectar estado del evento en tiempo real
- [ ] Suscribirse a cambios de `resultados_publicados` via Realtime

### 7.2 Pantalla "En Curso" (mientras se califica)
- [ ] Logo PJ + logo subsede
- [ ] Nombre del concurso y temática
- [ ] Barra de progreso general: "X de Y calificaciones completadas"
- [ ] Grid de categorías con estado:
  - Círculo de progreso por categoría
  - Cuántos jurados completaron (sin mostrar puntajes)
- [ ] Animación de fondo en loop (suave, no distrae)
- [ ] Mensaje motivacional rotativo
- [ ] Todo en fuente grande (optimizado para 1080p proyector)

### 7.3 Pantalla de revelación de resultados
- [ ] Transición animada al publicar una categoría
- [ ] Sonido de anuncio al revelar (usando Howler.js)
- [ ] Podio animado:
  - Aparece primero el 3er puesto (animación slide-up)
  - Luego el 2do puesto
  - Finalmente el 1er puesto con efectos más elaborados (confetti, brillo)
- [ ] Muestra: nombre del participante, puntaje total, categoría
- [ ] Texto grande legible desde lejos
- [ ] Botón invisible (o tecla) para el administrador pasar a la siguiente categoría

### 7.4 Pantalla "Concurso finalizado"
- [ ] Cuando todas las categorías están publicadas
- [ ] Muestra todos los ganadores en resumen
- [ ] Animación de cierre

---

## FASE 8 — Cálculo de resultados y exportación
**Duración estimada: 1.5 días**

### 8.1 Motor de cálculo de puntajes
- [ ] Función `calcularPuntajeParticipante(participante_id)`:
  - Suma puntajes por criterio de cada jurado
  - Calcula promedio entre todos los jurados
- [ ] Función `calcularRankingCategoria(categoria_id)`:
  - Aplica desempate por criterio configurado
  - Retorna lista ordenada con puestos asignados
- [ ] Manejo de empates en cascada (criterio 1, criterio 2, etc.)
- [ ] Tests unitarios de la lógica de desempate

### 8.2 Vista de resultados completos (admin)
- [ ] Tabla por categoría con todos los participantes
- [ ] Columnas: código, nombre, puntaje por jurado, promedio, puesto
- [ ] Destacar ganadores (1°, 2°, 3°)
- [ ] Indicar empates detectados

### 8.3 Exportar a Excel
- [ ] Hoja "Resumen" con todos los ganadores por categoría
- [ ] Una hoja por categoría con detalle completo
- [ ] Columnas: participante, criterio 1 jurado 1, criterio 1 jurado 2... promedio criterio, total, puesto
- [ ] Aplicar estilos básicos (headers en negrita, ganadores destacados)
- [ ] Nombre del archivo: `resultados_{nombre_evento}_{fecha}.xlsx`

### 8.4 Exportar Acta Oficial (PDF)
- [ ] Encabezado:
  - Logo PJ (izquierda) + Logo subsede (derecha)
  - Nombre del evento centrado
  - Fecha y sede
- [ ] Sección por cada categoría:
  - Nombre de la categoría
  - Tabla: puesto, nombre del ganador, puntaje total
- [ ] Lista de jurados calificadores
- [ ] Pie de página con espacio para firma:
  ```
  ___________________    ___________________    ___________________
  Jurado 1               Jurado 2               Jurado 3
  [Nombre completo]      [Nombre completo]      [Nombre completo]
  ```
- [ ] Paginación si excede una página
- [ ] Nombre del archivo: `acta_{nombre_evento}_{fecha}.pdf`

---

## FASE 9 — Historial y consulta de eventos pasados
**Duración estimada: 0.5 días**

### 9.1 Listado de eventos históricos
- [ ] Lista paginada de eventos cerrados/publicados
- [ ] Buscar por nombre, fecha
- [ ] Ver estado y métricas básicas

### 9.2 Detalle de evento histórico
- [ ] Ver configuración completa (categorías, criterios, jurados)
- [ ] Ver todos los resultados (solo lectura)
- [ ] Regenerar PDF y Excel de ese evento
- [ ] Opción de clonar ese evento como base para uno nuevo

---

## FASE 10 — Integración Lemon Squeezy
**Duración estimada: 1 día**

### 10.1 Configuración
- [ ] Crear productos en Lemon Squeezy (Plan Básico, Plan Institucional)
- [ ] Configurar webhook endpoint en Supabase Edge Function
- [ ] Manejar eventos: `subscription_created`, `subscription_updated`, `subscription_cancelled`

### 10.2 Control de acceso por plan
- [ ] Verificar plan al crear evento (gratuito: máx 1 evento)
- [ ] Bloquear exportación PDF en plan gratuito con CTA de upgrade
- [ ] Página de planes con precios y comparativa
- [ ] Botón de upgrade que abre checkout de Lemon Squeezy

### 10.3 Panel de facturación (admin)
- [ ] Ver plan actual y fecha de renovación
- [ ] Enlace a portal de cliente de Lemon Squeezy
- [ ] Historial de pagos

---

## FASE 11 — Polish, optimización y QA
**Duración estimada: 2 días**

### 11.1 Responsive y UX
- [ ] Audit completo mobile (panel jurado debe ser perfecto en celular)
- [ ] Audit pantalla pública en resolución 1080p
- [ ] Loading states en todas las operaciones async
- [ ] Error boundaries con mensajes amigables
- [ ] Estados vacíos con mensajes claros (ej: "No hay participantes en esta categoría")
- [ ] Toasts de confirmación para acciones importantes

### 11.2 Performance
- [ ] Lazy loading de rutas
- [ ] Optimizar consultas con índices en Supabase
- [ ] Caché de datos con React Query o SWR (evaluar)
- [ ] Optimizar re-renders en componentes de tiempo real

### 11.3 Seguridad final
- [ ] Audit de políticas RLS
- [ ] Validación server-side en Edge Functions para operaciones críticas
- [ ] Rate limiting en endpoints de auth
- [ ] Sanitización de inputs

### 11.4 Testing
- [ ] Tests de la lógica de cálculo y desempate
- [ ] Tests de los flujos críticos (calificación, publicación)
- [ ] Prueba de estrés con Realtime (múltiples jurados simultáneos)
- [ ] Prueba completa de un evento de punta a punta

### 11.5 Documentación
- [ ] README con instrucciones de setup
- [ ] Guía de uso para Admin
- [ ] Guía de uso para Jurado
- [ ] Documentación de API/funciones SQL

---

## Resumen de fases y tiempos

| Fase | Descripción | Días estimados |
|------|-------------|---------------|
| 0 | Setup y configuración | 1 |
| 1 | Schema Supabase | 1 |
| 2 | Autenticación y routing | 1 |
| 3 | Panel Super Admin | 1 |
| 4 | Panel Admin (núcleo) | 4 |
| 5 | Panel Administrador | 1 |
| 6 | Panel Jurado (mobile) | 2 |
| 7 | Pantalla pública / proyector | 1.5 |
| 8 | Cálculo y exportación | 1.5 |
| 9 | Historial eventos | 0.5 |
| 10 | Lemon Squeezy | 1 |
| 11 | Polish y QA | 2 |
| **TOTAL** | | **~17.5 días** |

---

## Orden de prioridad para MVP

Si necesitas un MVP funcional para el próximo evento primero:

```
Fases 0 → 1 → 2 → 4 (sin clonar/plantillas) → 6 → 7 → 8 → 5
```
Eso da un sistema funcional en ~12 días.
Las fases 3, 9, 10, y features avanzadas van después.

---

## Decisiones técnicas pendientes de confirmar

- [ ] ¿Usar React Query para caché o solo Supabase hooks nativos?
- [ ] ¿Zustand o Context API para estado global?
- [ ] ¿Confirmar dominio del sistema?
- [ ] ¿El acta PDF necesita numeración oficial o folio?
- [ ] ¿Qué sonido para el anuncio de ganadores? (subir archivo o usar sonido del sistema)

---

## Estado real actualizado (Abr 2026)

- Repositorio: creado en GitHub (`https://github.com/mscnegocio-del/concurso`)
- Supabase: proyecto creado (`https://becqprcmjxpwiwgflvoj.supabase.co`)
- Estilos: migrar y mantener estándar en **Tailwind CSS v4**
