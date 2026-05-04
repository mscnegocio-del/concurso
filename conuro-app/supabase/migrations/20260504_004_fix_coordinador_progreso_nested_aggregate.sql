-- Fix: coordinador_progreso_evento tenía COUNT anidados (no permitido en PostgreSQL).
-- Se separa el cálculo de categorías_completas en un CTE aparte.

DROP FUNCTION IF EXISTS public.coordinador_progreso_evento(uuid);

CREATE FUNCTION public.coordinador_progreso_evento(p_evento_id uuid)
RETURNS TABLE (
  evento_id            uuid,
  evento_nombre        text,
  estado               text,
  total_categorias     bigint,
  categorias_completas bigint,
  total_jurados        bigint,
  total_participantes  bigint,
  calificaciones_totales     bigint,
  calificaciones_completadas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH evento_data AS (
    SELECT e.id, e.nombre, e.estado, o.id AS org_id
    FROM eventos e
    JOIN organizaciones o ON e.organizacion_id = o.id
    WHERE e.id = p_evento_id
      AND EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = auth.uid()
          AND u.organizacion_id = o.id
          AND u.rol IN ('admin', 'coordinador', 'super_admin')
      )
  ),
  stats AS (
    SELECT
      ed.id  AS ev_id,
      ed.nombre,
      ed.estado,
      COUNT(DISTINCT c.id)  AS total_categorias,
      COUNT(DISTINCT j.id)  AS total_jurados,
      COUNT(DISTINCT p.id)  AS total_participantes,
      COUNT(cal.id)         AS calificaciones_totales,
      COUNT(cal.id) FILTER (WHERE cal.puntaje IS NOT NULL) AS calificaciones_completadas
    FROM evento_data ed
    LEFT JOIN categorias c    ON c.evento_id  = ed.id
    LEFT JOIN jurados j       ON j.evento_id  = ed.id
    LEFT JOIN participantes p ON p.categoria_id = c.id
    LEFT JOIN calificaciones cal ON cal.participante_id = p.id AND cal.jurado_id = j.id
    GROUP BY ed.id, ed.nombre, ed.estado
  ),
  cat_stats AS (
    SELECT
      ed.id AS ev_id,
      c.id  AS cat_id,
      COUNT(DISTINCT j.id) AS jurados_count,
      COUNT(DISTINCT p.id) AS partic_count,
      COUNT(cal.id) FILTER (WHERE cal.puntaje IS NOT NULL) AS cals_ok
    FROM evento_data ed
    LEFT JOIN categorias c    ON c.evento_id   = ed.id
    LEFT JOIN jurados j       ON j.evento_id   = ed.id
    LEFT JOIN participantes p ON p.categoria_id = c.id
    LEFT JOIN calificaciones cal ON cal.participante_id = p.id AND cal.jurado_id = j.id
    GROUP BY ed.id, c.id
  ),
  completas AS (
    SELECT ev_id, COUNT(*) AS total
    FROM cat_stats
    WHERE jurados_count > 0
      AND partic_count  > 0
      AND cals_ok = jurados_count * partic_count
    GROUP BY ev_id
  )
  SELECT
    s.ev_id,
    s.nombre,
    s.estado,
    s.total_categorias,
    COALESCE(cp.total, 0),
    s.total_jurados,
    s.total_participantes,
    s.calificaciones_totales,
    s.calificaciones_completadas
  FROM stats s
  LEFT JOIN completas cp ON cp.ev_id = s.ev_id;
END;
$$;
