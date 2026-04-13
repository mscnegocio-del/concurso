# Plan Ejecutable por Sprints — Sistema de Concurso

Este documento traduce `plan_implementacion.md` en sprints con tareas operativas, listas para ejecutar.

## Supuestos de planificación

- Duración por sprint: **1 semana (5 días hábiles)**.
- Equipo mínimo recomendado: **1 dev full-stack + 1 apoyo QA/UAT parcial**.
- Objetivo principal: entregar **MVP funcional** para evento real primero.
- Prioridad MVP basada en el plan original: **Fases 0 → 1 → 2 → 4 (recortada) → 6 → 7 → 8 → 5**.
- Base técnica confirmada: **Tailwind CSS v4**.

---

## Actualización ejecutiva (Abr 2026)

### Estado funcional consolidado

- Flujo core completo: Admin configura, Jurado califica, Administrador/Admin publica, Público visualiza.
- Módulos añadidos luego del MVP inicial:
  - Plantillas de criterios (`/admin/plantillas-criterios` + aplicación en eventos).
  - Reutilización de jurados vía importación desde evento origen.
  - Pantalla pública tematizable (oscuro/claro + acento).
  - Revelación de podio por evento: `simultaneo` o `escalonado` (`3→2→1`, `2→1`), con bloqueo de categoría activa en coordinación.

### Hallazgos / warnings técnicos a monitorear

- Warning de bundle size en `npm run build` (no bloqueante).
- Webhook Lemon pendiente de endurecimiento productivo (firma y sincronización de plan).
- Falta cerrar checklist de UAT integral en evento real (incluyendo casos de revelación escalonada con evento en estado `cerrado`).

---

## Sprint 1 — Fundación técnica (Setup + DB base)

**Objetivo:** dejar lista la base técnica y el esquema de datos seguro en Supabase.

### Alcance
- Fase 0 completa
- Fase 1 (tablas, relaciones, constraints y RLS inicial)

### Tareas ejecutables

#### Proyecto y tooling
- [x] Crear repositorio en GitHub (`https://github.com/mscnegocio-del/concurso`)
- [x] Inicializar proyecto React + Vite + TypeScript (en `conuro-app/`)
- [x] Configurar Tailwind, ESLint, Prettier
- [x] Implementar estructura de carpetas base
- [x] Configurar alias `@/` en Vite + TS
- [x] Crear `.env.example`
- [x] Instalar dependencias núcleo (UI, routing, forms, estado, supabase)

#### Supabase base
- [x] Crear proyecto Supabase (`https://becqprcmjxpwiwgflvoj.supabase.co`)
- [x] Configurar Auth OTP por email (8 dígitos)
- [x] Crear bucket `logos` público
- [x] Crear `src/lib/supabase.ts`

#### Base de datos
- [x] Crear tablas: organizaciones, usuarios, eventos, categorias, participantes, jurados, criterios, calificaciones
- [x] Crear tablas: plantillas_criterios, plantilla_criterios_items, resultados_publicados, audit_log
- [x] Definir FKs y ON DELETE apropiado
- [x] Crear unique key `(jurado_id, participante_id, criterio_id)`
- [x] Implementar validación “un evento activo por organización”
- [x] Implementar check de rango de puntajes

#### Seguridad
- [x] Activar RLS en todas las tablas
- [x] Políticas por `organizacion_id` para admin/administrador
- [x] Políticas de jurado para acceso solo a sus calificaciones
- [x] Política de audit_log solo insert

### Entregables
- Migraciones SQL versionadas
- Proyecto compilando en local
- Entorno Supabase operativo con esquema y RLS básico

### Criterios de cierre (DoD)
- [x] `npm run build` pasa
- [x] Migraciones ejecutan en entorno limpio
- [x] Prueba manual: usuario de org A no ve datos de org B

---

## Sprint 2 — Acceso y navegación segura (Auth + Routing + sesión jurado)

**Objetivo:** tener entrada al sistema por roles y navegación protegida.

### Alcance
- Fase 2 completa
- Base de layout para paneles

### Tareas ejecutables

#### Routing y guards
- [x] Definir rutas públicas y protegidas
- [x] Implementar guard por rol (`super_admin`, `admin`, `administrador`)
- [x] Redirect por rol al iniciar sesión
- [x] Página `/jurado` independiente con sesión propia

#### Auth Admin/Administrador
- [x] Pantalla login por email
- [x] Flujo OTP 8 dígitos (enviar, validar, reenviar)
- [x] Manejo de errores (inválido, expirado, red)
- [x] Persistencia de sesión y logout

#### Ingreso jurado
- [x] Validar código de evento por estado (`abierto`/`calificando`)
- [x] Buscar/crear jurado por nombre y evento
- [x] Guardar sesión de jurado en `sessionStorage`
- [x] Redirección a panel jurado

#### Estado global
- [x] Implementar `useAuth()`
- [x] Implementar `useJurado()`
- [x] Proveer contexto en layout app

### Entregables
- Login OTP funcional para admin/administrador
- Ingreso jurado funcional
- Sistema de rutas completo del MVP

### Criterios de cierre (DoD)
- [x] No hay rutas protegidas accesibles sin sesión
- [x] Cada rol cae en su módulo correcto
- [x] Jurado puede retomar sesión tras refresh

---

## Sprint 3 — Operación del evento (Admin núcleo + Jurado califica)

**Objetivo:** permitir configurar evento y capturar calificaciones reales de jurados.

### Alcance
- Fase 4 recortada al MVP (sin clonados avanzados, sin plantillas complejas)
- Fase 6 casi completa

### Tareas ejecutables

#### Admin núcleo MVP
- [x] CRUD evento activo (crear, editar en borrador, ver detalle)
- [x] CRUD categorías
- [x] CRUD participantes con código automático por categoría
- [x] CRUD jurados básico
- [x] CRUD criterios del evento + criterio desempate
- [x] Botones de transición: `borrador→abierto→calificando→cerrado`
- [x] Validaciones antes de activar evento (mínimos requeridos)

#### Jurado mobile-first
- [x] Dashboard jurado con progreso por categoría
- [x] Lista de participantes por categoría en orden
- [x] Restricción secuencial (no saltar participantes)
- [x] Form de calificación por criterios (slider + input)
- [x] Guardado de notas y avance al siguiente participante
- [x] Edición de notas solo en estado `calificando`

#### Auditoría y reglas críticas
- [x] Registrar acciones críticas en `audit_log`
- [x] Bloquear edición cuando estado `cerrado`
- [x] Proteger que jurado no vea notas de otros

### Entregables
- Flujo completo Admin configura → Jurado califica
- Datos persistidos y consultables en Supabase

### Criterios de cierre (DoD)
- [x] 1 evento demo completo en estado `calificando`
- [x] 2 jurados pueden registrar notas sin conflicto de permisos
- [x] Al cerrar, notas quedan bloqueadas

---

## Sprint 4 — Resultados en vivo (Pantalla pública + Administrador + Realtime)

**Objetivo:** mostrar progreso y revelar resultados por categoría en tiempo real.

### Alcance
- Fase 7 completa (MVP visual)
- Fase 5 completa (control de publicación)
- Realtime clave en eventos/calificaciones/resultados_publicados

### Tareas ejecutables

#### Realtime
- [x] Progreso en vivo: polling + RPC (sin suscripción directa a `calificaciones`; evita filtrado por evento en Realtime)
- [x] Suscripción a `resultados_publicados`
- [x] Suscripción a cambios de estado en `eventos`

#### Panel Administrador
- [x] Dashboard con progreso por categoría en vivo
- [x] Vista de ranking previo por categoría
- [x] Acción “Publicar resultados de categoría”
- [x] Historial de categorías publicadas

#### Pantalla pública
- [x] Ruta pública por `evento_slug` (usa `codigo_acceso` del evento)
- [x] Vista “En curso” con progreso general y por categoría
- [x] Vista “Revelación” con podio 1-2-3
- [x] Sonido de anuncio al revelar
- [x] Vista “Concurso finalizado”

### Entregables
- Proyección pública funcional
- Panel administrador controla publicación por categoría

### Criterios de cierre (DoD)
- [x] Publicar una categoría actualiza la pantalla pública sin refresh
- [x] No se muestran puntajes no publicados al público
- [x] Flujo visual usable en 1080p

---

## Sprint 5 — Cálculo final + Exportables + QA de evento real

**Objetivo:** cerrar ciclo operativo con ranking confiable, acta PDF y Excel.

### Alcance
- Fase 8 completa
- Fase 11 parcial (QA, rendimiento y robustez para producción)

### Tareas ejecutables

#### Motor de resultados
- [x] Implementar cálculo de promedio por participante
- [x] Implementar ranking por categoría
- [x] Implementar desempate en cascada por criterios
- [x] Crear tests unitarios para empate/desempate

#### Exportación
- [x] Exportar Excel por categoría + resumen
- [x] Exportar Acta PDF con logos, jurados y ganadores
- [x] Nombres de archivo estandarizados por evento/fecha

#### Hardening MVP
- [x] Loading states y errores amigables en flujos críticos (exportaciones)
- [x] Error boundaries en paneles principales (`App` envuelto en `ErrorBoundary`)
- [ ] Optimizaciones básicas de render en vistas realtime (pendiente fino)
- [ ] Prueba E2E manual de evento completo (la harás al final)

### Entregables
- Ranking oficial confiable
- Archivos PDF y Excel descargables
- Check de QA para evento productivo

### Criterios de cierre (DoD)
- [ ] Cálculos coinciden con validación manual en casos de prueba *(pendiente: UAT al final)*
- [ ] PDF y Excel exportan sin errores en evento demo completo *(pendiente: UAT al final)*
- [ ] Flujo punta a punta aprobado por usuario negocio *(pendiente: UAT al final)*

**Estado:** implementación del sprint **cerrada**; las casillas anteriores se marcan cuando ejecutes la batería manual de verificación total.

---

## Sprint 6 — Post-MVP (Escalamiento y negocio)

**Objetivo:** completar módulos no críticos para primera salida, pero importantes para escalamiento.

### Alcance
- Fase 3 (Super Admin)
- Fase 9 (historial)
- Fase 10 (Lemon Squeezy)
- Fase 11 restante (seguridad/performance/documentación)

### Tareas ejecutables
- [x] Panel Super Admin y gestión de organizaciones
- [x] Historial de eventos + clonado
- [x] Integración de suscripciones y webhooks Lemon Squeezy *(esqueleto Edge Function `lemon-webhook`; verificar firma y mapeo a `plan` en producción)*
- [x] Restricciones por plan (free/básico/institucional) *(PDF y tope de jurados en gratuito)*
- [x] Revisión final RLS + Edge Functions críticas *(RLS insert/update org para `super_admin`; RPC `admin_clonar_evento`)*
- [ ] Documentación de operación y soporte *(pendiente handoff; código comentado en webhook)*

### Criterios de cierre (DoD)
- [x] Multi-tenant administrable de extremo a extremo *(super admin: orgs; admin: eventos + historial)*
- [ ] Facturación integrada y reflejada en permisos *(webhook Lemon pendiente de lógica de negocio / Lemon dashboard)*
- [ ] Manual operativo listo para handoff

---

## Backlog priorizado (Ready) para arrancar ya

Usa esta lista en orden para iniciar ejecución desde hoy.

### Semana 1 (Sprint 1)
- [x] Crear proyecto Vite+TS y estructura final de carpetas
- [x] Configurar Supabase + cliente en frontend
- [x] Ejecutar migración inicial de tablas core
- [x] Aplicar políticas RLS mínimas por organización
- [x] Crear datos seed de demo para pruebas

### Semana 2 (Sprint 2)
- [x] Implementar login OTP admin/administrador
- [x] Implementar sesión jurado por código de evento
- [x] Proteger rutas y redirecciones por rol
- [x] Montar layouts base de paneles

### Semana 3 (Sprint 3)
- [x] CRUD evento/categorías/participantes/jurados/criterios
- [x] Cambios de estado del evento con validaciones
- [x] Flujo de calificación jurado secuencial
- [x] Bloqueo de edición al cerrar evento

### Semana 4 (Sprint 4)
- [x] Dashboard administrador en vivo
- [x] Publicación por categoría
- [x] Pantalla pública “en curso” + “revelación”
- [x] Realtime estable en cambios clave *(más polling de progreso donde Realtime no filtra por evento)*

### Semana 5 (Sprint 5)
- [x] Motor de ranking y desempate
- [x] Exportación Excel y Acta PDF
- [ ] QA E2E + ajustes de estabilidad *(pendiente: tu batería manual al final)*

---

## Riesgos y mitigaciones por sprint

- **RLS complejo desde temprano:** validar políticas con casos de prueba por rol cada sprint.
- **Realtime con alta concurrencia:** probar con datos simulados de varios jurados desde Sprint 3.
- **Reglas de desempate ambiguas:** congelar especificación con ejemplos concretos antes de Sprint 5.
- **Dependencia de assets (logos/sonidos):** definir placeholders desde Sprint 1 para no bloquear UI.
- **Desvío por features no-MVP:** mantener backlog “post-MVP” fuera de Sprints 1-5.

### Cómo quedó mitigado (tras Sprints 1–6)

| Riesgo | Mitigación aplicada en el producto |
|--------|-----------------------------------|
| **RLS** | Políticas por `organizacion_id`; jurado vía **RPC `SECURITY DEFINER`** + `token_sesion`; fila `resultados_publicados` sin lectura global para `anon` (solo RPC); super admin con políticas dedicadas en `organizaciones` (Sprint 6). La **validación exhaustiva por rol** sigue siendo parte del **UAT** que harás al final. |
| **Realtime / concurrencia** | Canales sobre `resultados_publicados` y `eventos` donde aplica; **progreso** con **polling + RPC** cuando no hay columna `evento_id` para filtrar en `calificaciones`. Prueba multi-jurado: pendiente de tu ensayo en evento demo. |
| **Desempate** | Regla fijada en **`src/utils/ranking.ts`** (desempate primero, luego criterios en orden) y **tests unitarios** en `ranking.test.ts`. |
| **Logos / sonidos** | Pantalla pública: placeholder “PJ” si no hay logo; revelación con **Web Audio** (`playRevealChime`) sin asset externo obligatorio. |
| **Scope no-MVP** | Sprints 1–5 cerraron MVP; **Sprint 6** (super admin, historial, planes, webhook esqueleto) quedó como **post-MVP** explícito en el plan. |

---

## Definición de “MVP listo para evento”

Se considera MVP listo cuando:
- [x] Admin crea evento completo y lo lleva a `calificando` *(verificar en UAT)*
- [x] Jurados califican de forma secuencial desde móvil *(verificar en UAT)*
- [x] Administrador publica resultados por categoría *(verificar en UAT)*
- [x] Pantalla pública muestra podio en tiempo real *(polling + realtime en publicaciones; verificar en UAT)*
- [x] Sistema exporta Excel y Acta PDF con ganadores *(plan no gratuito para PDF; verificar en UAT)*

---

## Estado inicial ya completado

- [x] Repositorio creado
- [x] Proyecto Supabase creado
- [x] Decisión de stack de estilos: Tailwind CSS v4

### Entorno de prueba (referencia)

Documentación viva de arquitectura, RPCs y rutas: **[CLAUDE.md](CLAUDE.md)**.

- [x] Usuario **super_admin** en Auth + `usuarios` (alta manual)
- [x] **Organización** creada
- [x] Usuario **admin** + **evento** creado (pendiente completar en UI: criterios, categorías, participantes, jurados según flujo)

