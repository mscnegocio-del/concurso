# Conuro — Plataforma de concursos con jurados y pantalla pública

Sistema web multi-tenant para instituciones que organizan concursos evaluados por jurado: configuración de eventos, calificación en tiempo real, publicación de podio en TV/proyector y exportación oficial (Excel/PDF según plan).

## Estado actual (Abr 2026)

- Repositorio: [mscnegocio-del/concurso](https://github.com/mscnegocio-del/concurso)
- App frontend: [`conuro-app/`](conuro-app/)
- Supabase: migraciones activas en `conuro-app/supabase/migrations/`
- Flujo operativo implementado:
  - Admin configura evento, categorías, criterios, participantes y jurados.
  - Jurados califican sin cuenta Auth (token de sesión por jurado).
  - Administrador/admin publica por categoría en coordinación.
  - Pantalla pública muestra progreso y podio por categoría.
  - Exportaciones Excel/PDF.

## Novedades recientes

### Sprint 8 (14 de abril 2026)
- **UI mejorada:** Sidebar sticky, alertas con colores semánticos, dashboard responsivo 2-columnas en desktop
- **Historial actualizado:** Bug fix en `coordinador_avanzar_revelacion_categoria` — ahora registra la última publicación, no solo la primera
- **Realtime en pantalla pública:** Pantalla TV se actualiza en tiempo real al publicar (no espera 5 segundos de polling)

### Sprints anteriores
- Plantillas de criterios por organización (CRUD + aplicar en evento + opción al crear evento).
- Importación de jurados desde eventos anteriores.
- Personalización de pantalla pública (tema claro/oscuro + color acento).
- Revelación de podio por evento:
  - `simultaneo` (todos los puestos juntos)
  - `escalonado` (`3→2→1` o `2→1` según podio)
  - bloqueo de cambio de categoría mientras una revelación escalonada esté incompleta.

## Rutas principales

- `/login` — acceso OTP (`admin`, `administrador`, `super_admin`)
- `/admin/evento`, `/admin/historial`, `/admin/coordinacion`, `/admin/plantillas-criterios`
- `/administrador` — coordinación/publicación
- `/jurado` y `/jurado/panel/*`
- `/publico/:codigo_acceso`
- `/super` — gestión de organizaciones

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

