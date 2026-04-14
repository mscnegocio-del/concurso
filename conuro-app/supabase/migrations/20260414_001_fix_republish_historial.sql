-- Fix: coordinador_avanzar_revelacion_categoria debe actualizar publicado_at
-- al republicar una categoría incluso si ya está completamente revelada (modo simultáneo)
-- y también en pantalla pública (PublicoEventoPage) debe usar Realtime en lugar de solo polling

create or replace function public.coordinador_avanzar_revelacion_categoria(
  p_evento_id uuid,
  p_categoria_id uuid
)
returns table (
  paso_revelacion int,
  completado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_puestos int;
  v_modo text;
  v_paso_actual int;
  v_cat_activa uuid;
  v_cat_activa_paso int;
begin
  select public._usuario_puede_evento(p_evento_id) into v_ok;
  if not v_ok then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1 from public.categorias c
    where c.id = p_categoria_id and c.evento_id = p_evento_id
  ) then
    raise exception 'Categoria invalida';
  end if;

  select e.puestos_a_premiar, e.modo_revelacion_podio
  into v_puestos, v_modo
  from public.eventos e
  where e.id = p_evento_id;

  if v_puestos is null then
    raise exception 'Evento no encontrado';
  end if;

  if v_modo = 'escalonado' then
    select rp.categoria_id, rp.paso_revelacion
    into v_cat_activa, v_cat_activa_paso
    from public.resultados_publicados rp
    where rp.evento_id = p_evento_id
      and rp.paso_revelacion > 0
      and rp.paso_revelacion < v_puestos
    order by rp.publicado_at desc
    limit 1;

    if v_cat_activa is not null and v_cat_activa <> p_categoria_id then
      raise exception 'Debes terminar la revelacion de la categoria en progreso antes de cambiar';
    end if;
  end if;

  insert into public.resultados_publicados (
    evento_id,
    categoria_id,
    publicado_por,
    publicado_at,
    paso_revelacion
  )
  values (
    p_evento_id,
    p_categoria_id,
    auth.uid(),
    now(),
    case when v_modo = 'simultaneo' then v_puestos else 0 end
  )
  on conflict (evento_id, categoria_id) do nothing;

  select rp.paso_revelacion
  into v_paso_actual
  from public.resultados_publicados rp
  where rp.evento_id = p_evento_id
    and rp.categoria_id = p_categoria_id
  for update;

  if v_modo = 'simultaneo' then
    -- Modo simultaneo: siempre actualiza a paso_revelacion = v_puestos
    -- y registra quien y cuando publica (incluso al republicar)
    update public.resultados_publicados rp2
    set
      paso_revelacion = v_puestos,
      publicado_at = now(),
      publicado_por = auth.uid()
    where rp2.evento_id = p_evento_id and rp2.categoria_id = p_categoria_id
    returning rp2.paso_revelacion into v_paso_actual;

    return query select v_paso_actual, (v_paso_actual >= v_puestos);
    return;
  end if;

  -- Modo escalonado: incrementa el paso de revelacion
  if v_paso_actual < v_puestos then
    update public.resultados_publicados rp2
    set
      paso_revelacion = least(v_paso_actual + 1, v_puestos),
      publicado_at = now(),
      publicado_por = auth.uid()
    where rp2.evento_id = p_evento_id and rp2.categoria_id = p_categoria_id
    returning rp2.paso_revelacion into v_paso_actual;
  end if;

  return query select v_paso_actual, (v_paso_actual >= v_puestos);
end;
$$;

revoke all on function public.coordinador_avanzar_revelacion_categoria(uuid, uuid) from public;
grant execute on function public.coordinador_avanzar_revelacion_categoria(uuid, uuid) to authenticated;
