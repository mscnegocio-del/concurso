-- Fix: coordinador_ranking_categoria llamaba _puntajes_finales_categoria con 3 args
-- pero esa función solo acepta 1 arg (p_categoria_id).
-- Versión correcta: usa _puntajes_finales_categoria(p_categoria_id) + CTE para
-- promedio_por_criterio + incluye campo institucion del sprint 9.

DROP FUNCTION IF EXISTS public.coordinador_ranking_categoria(uuid, uuid);

CREATE FUNCTION public.coordinador_ranking_categoria(p_evento_id uuid, p_categoria_id uuid)
RETURNS TABLE (
  participante_id       uuid,
  codigo                text,
  nombre_completo       text,
  institucion           text,
  puntaje_final         numeric,
  promedio_por_criterio jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT public._usuario_puede_evento(p_evento_id) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categorias c
    WHERE c.id = p_categoria_id AND c.evento_id = p_evento_id
  ) THEN
    RAISE EXCEPTION 'Categoría inválida';
  END IF;

  RETURN QUERY
  WITH por_jurado_criterio AS (
    SELECT
      cal.participante_id,
      cal.criterio_id,
      round(avg(cal.puntaje)::numeric, 2) AS promedio_criterio
    FROM public.calificaciones cal
    JOIN public.participantes p ON p.id = cal.participante_id
    WHERE p.categoria_id = p_categoria_id
    GROUP BY cal.participante_id, cal.criterio_id
  ),
  criterio_json AS (
    SELECT
      pjc.participante_id,
      jsonb_object_agg(pjc.criterio_id::text, pjc.promedio_criterio) AS promedio_por_criterio
    FROM por_jurado_criterio pjc
    GROUP BY pjc.participante_id
  )
  SELECT
    pf.participante_id,
    pf.codigo,
    pf.nombre_completo,
    p.institucion,
    pf.puntaje_final,
    COALESCE(cj.promedio_por_criterio, '{}'::jsonb) AS promedio_por_criterio
  FROM public._puntajes_finales_categoria(p_categoria_id) pf
  JOIN public.participantes p ON p.id = pf.participante_id
  LEFT JOIN criterio_json cj ON cj.participante_id = pf.participante_id
  ORDER BY pf.puntaje_final DESC, pf.nombre_completo ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.coordinador_ranking_categoria(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coordinador_ranking_categoria(uuid, uuid) TO authenticated;
