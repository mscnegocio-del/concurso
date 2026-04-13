-- RPC: aplicar plantilla de criterios a un evento (solo borrador, sin calificaciones).
-- RPC: copiar jurados de un evento a otro (misma org, destino borrador/abierto, límite plan gratuito).

create or replace function public.admin_aplicar_plantilla_criterios(
  p_evento_id uuid,
  p_plantilla_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_evt uuid;
  v_estado public.estado_evento;
  v_org_plant uuid;
  n_cal bigint;
begin
  select e.organizacion_id, e.estado
  into v_org_evt, v_estado
  from public.eventos e
  where e.id = p_evento_id;

  if not found then
    raise exception 'Evento no encontrado';
  end if;

  if not public._admin_o_super_puede_org(v_org_evt) then
    raise exception 'No autorizado';
  end if;

  if v_estado <> 'borrador' then
    raise exception 'Solo se puede aplicar plantilla con el evento en borrador';
  end if;

  select pc.organizacion_id
  into v_org_plant
  from public.plantillas_criterios pc
  where pc.id = p_plantilla_id;

  if not found then
    raise exception 'Plantilla no encontrada';
  end if;

  if v_org_plant is distinct from v_org_evt then
    raise exception 'La plantilla no pertenece a la misma organizacion que el evento';
  end if;

  select count(*)::bigint
  into n_cal
  from public.calificaciones cal
  join public.criterios c on c.id = cal.criterio_id
  where c.evento_id = p_evento_id;

  if n_cal > 0 then
    raise exception 'Hay calificaciones registradas; no se pueden reemplazar los criterios';
  end if;

  delete from public.criterios
  where evento_id = p_evento_id;

  insert into public.criterios (evento_id, nombre, puntaje_maximo, orden, es_criterio_desempate)
  select
    p_evento_id,
    i.nombre,
    i.puntaje_maximo,
    i.orden,
    i.es_criterio_desempate
  from public.plantilla_criterios_items i
  where i.plantilla_id = p_plantilla_id
  order by i.orden;

  update public.eventos
  set plantilla_criterios_id = p_plantilla_id
  where id = p_evento_id;
end;
$$;

revoke all on function public.admin_aplicar_plantilla_criterios(uuid, uuid) from public;
grant execute on function public.admin_aplicar_plantilla_criterios(uuid, uuid) to authenticated;

-- Devuelve cuántos jurados nuevos se insertaron en destino (omite nombres ya existentes; respeta tope gratuito).
create or replace function public.admin_copiar_jurados_evento(
  p_destino_id uuid,
  p_origen_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_d uuid;
  v_org_o uuid;
  v_estado_d public.estado_evento;
  v_plan text;
  v_max int;
  v_count int;
  v_added int := 0;
  r record;
  v_next_ord int;
begin
  if p_destino_id = p_origen_id then
    raise exception 'El evento origen y destino deben ser distintos';
  end if;

  select e.organizacion_id, e.estado
  into v_org_d, v_estado_d
  from public.eventos e
  where e.id = p_destino_id;

  if not found then
    raise exception 'Evento destino no encontrado';
  end if;

  if not public._admin_o_super_puede_org(v_org_d) then
    raise exception 'No autorizado';
  end if;

  if v_estado_d not in ('borrador', 'abierto') then
    raise exception 'Solo se puede importar jurados si el evento destino esta en borrador o abierto';
  end if;

  select e.organizacion_id
  into v_org_o
  from public.eventos e
  where e.id = p_origen_id;

  if not found then
    raise exception 'Evento origen no encontrado';
  end if;

  if v_org_o is distinct from v_org_d then
    raise exception 'Los eventos deben pertenecer a la misma organizacion';
  end if;

  select o.plan
  into v_plan
  from public.organizaciones o
  where o.id = v_org_d;

  v_max := case
    when lower(trim(coalesce(v_plan, 'gratuito'))) in ('gratuito', 'free') then 3
    else null
  end;

  select count(*)::int
  into v_count
  from public.jurados j
  where j.evento_id = p_destino_id;

  for r in
    select j.nombre_completo, j.orden
    from public.jurados j
    where j.evento_id = p_origen_id
    order by j.orden
  loop
    if exists (
      select 1
      from public.jurados j2
      where j2.evento_id = p_destino_id
        and lower(trim(j2.nombre_completo)) = lower(trim(r.nombre_completo))
    ) then
      continue;
    end if;

    if v_max is not null and v_count >= v_max then
      exit;
    end if;

    select coalesce(max(j3.orden), 0) + 1
    into v_next_ord
    from public.jurados j3
    where j3.evento_id = p_destino_id;

    insert into public.jurados (evento_id, nombre_completo, orden, token_sesion)
    values (p_destino_id, trim(r.nombre_completo), v_next_ord, gen_random_uuid());

    v_count := v_count + 1;
    v_added := v_added + 1;
  end loop;

  return v_added;
end;
$$;

revoke all on function public.admin_copiar_jurados_evento(uuid, uuid) from public;
grant execute on function public.admin_copiar_jurados_evento(uuid, uuid) to authenticated;
