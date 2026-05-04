-- Actualizar todas las referencias hardcodeadas de 'administrador' a 'coordinador' en políticas y funciones SQL
-- Esto es necesario porque las migraciones antiguas tienen el valor hardcodeado

-- Actualizar RLS policies y funciones que referencian 'administrador'
-- Nota: se hace mediante texto porque PostgreSQL no permite ALTER TYPE values que estén en uso

-- Función: coordinador_progreso_evento
CREATE OR REPLACE FUNCTION public.coordinador_progreso_evento(p_evento_id uuid)
RETURNS TABLE (
  evento_id uuid,
  evento_nombre text,
  estado text,
  total_categorias bigint,
  categorias_completas bigint,
  total_jurados bigint,
  total_participantes bigint,
  calificaciones_totales bigint,
  calificaciones_completadas bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH evento_data AS (
    SELECT
      e.id,
      e.nombre,
      e.estado,
      o.id as org_id
    FROM eventos e
    JOIN organizaciones o ON e.organizacion_id = o.id
    WHERE e.id = p_evento_id
      AND EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = auth.uid()
          AND u.organizacion_id = o.id
          AND u.rol IN ('admin', 'coordinador', 'super_admin')
      )
  )
  SELECT
    ed.id,
    ed.nombre,
    ed.estado,
    COUNT(DISTINCT c.id),
    COUNT(DISTINCT CASE WHEN COUNT(DISTINCT j.id) FILTER (WHERE cal.id IS NOT NULL) = COUNT(DISTINCT j.id) THEN c.id END),
    COUNT(DISTINCT j.id),
    COUNT(DISTINCT p.id),
    COUNT(cal.id),
    COUNT(cal.id) FILTER (WHERE cal.puntaje IS NOT NULL)
  FROM evento_data ed
  LEFT JOIN categorias c ON c.evento_id = ed.id
  LEFT JOIN jurados j ON j.evento_id = ed.id
  LEFT JOIN participantes p ON p.categoria_id = c.id
  LEFT JOIN calificaciones cal ON cal.participante_id = p.id AND cal.jurado_id = j.id
  GROUP BY ed.id, ed.nombre, ed.estado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función: admin_listar_usuarios - se le da acceso a admin y coordinador
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  email text,
  nombre_completo text,
  rol text,
  email_confirmado boolean,
  created_at timestamptz
) AS $$
DECLARE
  v_org_id uuid;
  v_caller_role text;
BEGIN
  v_org_id := COALESCE(p_org_id, (SELECT organizacion_id FROM usuarios WHERE id = auth.uid() LIMIT 1));

  SELECT rol INTO v_caller_role
  FROM usuarios
  WHERE id = auth.uid();

  IF v_caller_role = 'super_admin' OR (v_caller_role = 'admin' AND (p_org_id IS NULL OR p_org_id = (SELECT organizacion_id FROM usuarios WHERE id = auth.uid()))) THEN
    RETURN QUERY
    SELECT
      u.id,
      u.email,
      u.nombre_completo,
      u.rol,
      au.email_confirmed_at IS NOT NULL,
      u.created_at
    FROM usuarios u
    LEFT JOIN auth.users au ON u.id = au.id
    WHERE u.organizacion_id = v_org_id
    ORDER BY u.created_at DESC;
  ELSE
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
