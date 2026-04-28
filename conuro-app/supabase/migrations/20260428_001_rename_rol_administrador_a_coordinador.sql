-- Renombrar valor del enum rol_usuario: 'administrador' -> 'coordinador'
-- Afecta tabla: usuarios (columna rol)
ALTER TYPE rol_usuario RENAME VALUE 'administrador' TO 'coordinador';
