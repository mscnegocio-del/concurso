-- Restaurar coordinador_progreso_evento a su firma original (por categoría).
-- Las migraciones _003 y _004 la cambiaron erróneamente a datos de evento-nivel,
-- rompiendo el sidebar de categorías en el panel en vivo.

DROP FUNCTION IF EXISTS public.coordinador_progreso_evento(uuid);

CREATE FUNCTION public.coordinador_progreso_evento(p_evento_id uuid)
RETURNS TABLE (
  categoria_id               uuid,
  categoria_nombre           text,
  orden                      int,
  total_participantes        bigint,
  num_jurados                bigint,
  num_criterios              bigint,
  calificaciones_registradas bigint,
  calificaciones_esperadas   bigint,
  publicado                  boolean,
  paso_revelacion            int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok      boolean;
  v_jurados bigint;
  v_crit    bigint;
BEGIN
  SELECT public._usuario_puede_evento(p_evento_id) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT count(*) INTO v_jurados FROM public.jurados j WHERE j.evento_id = p_evento_id;
  SELECT count(*) INTO v_crit    FROM public.criterios c WHERE c.evento_id = p_evento_id;

  RETURN QUERY
  SELECT
    cat.id,
    cat.nombre,
    cat.orden,
    (SELECT count(*)::bigint FROM public.participantes p WHERE p.categoria_id = cat.id),
    v_jurados,
    v_crit,
    (
      SELECT count(*)::bigint
      FROM public.calificaciones cal
      JOIN public.participantes p2 ON p2.id = cal.participante_id
      WHERE p2.categoria_id = cat.id
    ),
    CASE
      WHEN v_jurados = 0 OR v_crit = 0 THEN 0::bigint
      ELSE (
        SELECT count(*)::bigint FROM public.participantes p WHERE p.categoria_id = cat.id
      ) * v_jurados * v_crit
    END,
    (rp.categoria_id IS NOT NULL) AS publicado,
    COALESCE(rp.paso_revelacion, 0) AS paso_revelacion
  FROM public.categorias cat
  LEFT JOIN public.resultados_publicados rp
    ON rp.evento_id    = p_evento_id
   AND rp.categoria_id = cat.id
  WHERE cat.evento_id = p_evento_id
  ORDER BY cat.orden;
END;
$$;

REVOKE ALL ON FUNCTION public.coordinador_progreso_evento(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coordinador_progreso_evento(uuid) TO authenticated;
