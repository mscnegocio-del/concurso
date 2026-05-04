-- Migrar todos los usuarios existentes con rol 'administrador' a 'coordinador'
-- Esto es necesario porque PostgreSQL no actualiza automáticamente valores de enum existentes
-- cuando se renombra el valor del tipo enum

UPDATE public.usuarios
SET rol = 'coordinador'
WHERE rol = 'administrador';
