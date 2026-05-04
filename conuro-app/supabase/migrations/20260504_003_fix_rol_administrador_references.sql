-- Fix: eliminar referencias a 'administrador' (valor enum renombrado a 'coordinador')
-- El enum fue renombrado en producción pero las funciones no fueron actualizadas.

-- 1. coordinador_ranking_categoria — quita 'administrador' del check de rol
CREATE OR REPLACE FUNCTION public.coordinador_ranking_categoria(p_evento_id uuid, p_categoria_id uuid)
RETURNS TABLE(
  participante_id uuid,
  codigo text,
  nombre_completo text,
  institucion text,
  puntaje_final numeric,
  promedio_por_criterio jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_admin_org UUID;
  v_cat_org UUID;
BEGIN
  SELECT usuarios.organizacion_id INTO v_admin_org FROM public.usuarios
  WHERE usuarios.id = auth.uid()
    AND usuarios.rol IN ('admin', 'coordinador', 'super_admin');

  SELECT eventos.organizacion_id INTO v_cat_org FROM public.eventos
  WHERE eventos.id = p_evento_id;

  IF v_admin_org IS NULL OR v_cat_org IS NULL OR v_admin_org != v_cat_org THEN
    RAISE EXCEPTION 'No tiene permiso para acceder a esta información';
  END IF;

  RETURN QUERY
  SELECT
    pp.id,
    pp.codigo,
    pp.nombre_completo,
    pp.institucion,
    _puntajes_finales_categoria(p_evento_id, p_categoria_id, pp.id),
    jsonb_object_agg(
      COALESCE(cr.id::text, ''),
      COALESCE(AVG(cal.puntaje), 0)
    ) FILTER (WHERE cr.id IS NOT NULL)
  FROM participantes pp
  LEFT JOIN criterios cr ON cr.evento_id = p_evento_id
  LEFT JOIN calificaciones cal ON cal.participante_id = pp.id AND cal.criterio_id = cr.id
  WHERE pp.categoria_id = p_categoria_id
  GROUP BY pp.id, pp.codigo, pp.nombre_completo, pp.institucion
  ORDER BY _puntajes_finales_categoria(p_evento_id, p_categoria_id, pp.id) DESC, pp.codigo;
END;
$function$;

-- 2. _usuario_puede_evento — quita 'administrador' del check de rol
CREATE OR REPLACE FUNCTION public._usuario_puede_evento(p_evento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eventos e
    JOIN public.usuarios u ON u.organizacion_id = e.organizacion_id
    WHERE e.id = p_evento_id
      AND u.id = auth.uid()
      AND u.rol IN ('admin', 'coordinador', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public._usuario_puede_evento(uuid) FROM public;

-- 3. coordinador_progreso_evento — DROP + CREATE para poder cambiar firma
DROP FUNCTION IF EXISTS public.coordinador_progreso_evento(uuid);

CREATE FUNCTION public.coordinador_progreso_evento(p_evento_id uuid)
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
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;
