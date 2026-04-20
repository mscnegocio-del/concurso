-- Progreso de calificación por jurado y categoría para el panel coordinador.
-- Retorna una fila por cada par (jurado × categoría) del evento,
-- incluyendo jurados con cero notas registradas.

create or replace function public.coordinador_progreso_jurados(p_evento_id uuid)
returns table (
  jurado_id                  uuid,
  jurado_nombre              text,
  jurado_orden               int,
  categoria_id               uuid,
  categoria_nombre           text,
  calificaciones_registradas bigint,
  calificaciones_esperadas   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok   boolean;
  v_crit bigint;
begin
  select public._usuario_puede_evento(p_evento_id) into v_ok;
  if not v_ok then
    raise exception 'No autorizado';
  end if;

  -- Total de criterios del evento (mismo para todos los jurados/categorías)
  select count(*) into v_crit
  from public.criterios c
  where c.evento_id = p_evento_id;

  return query
  select
    j.id                                                                    as jurado_id,
    j.nombre_completo                                                       as jurado_nombre,
    j.orden                                                                 as jurado_orden,
    cat.id                                                                  as categoria_id,
    cat.nombre                                                              as categoria_nombre,
    (
      select count(*)::bigint
      from public.calificaciones cal
      join public.participantes p2 on p2.id = cal.participante_id
      where cal.jurado_id = j.id
        and p2.categoria_id = cat.id
    )                                                                       as calificaciones_registradas,
    case
      when v_crit = 0 then 0::bigint
      else (
        select count(*)::bigint
        from public.participantes p3
        where p3.categoria_id = cat.id
      ) * v_crit
    end                                                                     as calificaciones_esperadas
  from public.jurados j
  cross join public.categorias cat
  where j.evento_id  = p_evento_id
    and cat.evento_id = p_evento_id
  order by cat.orden, j.orden;
end;
$$;

revoke all on function public.coordinador_progreso_jurados(uuid) from public;
grant execute on function public.coordinador_progreso_jurados(uuid) to authenticated;
