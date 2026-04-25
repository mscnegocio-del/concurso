-- Gate de los RPCs públicos por `tiene_tv_publica`.
-- Cuando el admin desactiva la pantalla pública, los RPCs `publico_*` devuelven
-- vacío para que `/publico/:codigo` no exponga datos del evento.
-- Si vuelve a activarse, los datos reaparecen automáticamente (Realtime ya
-- entrega el cambio en la vista pública).

-- 1) publico_evento_por_codigo: si TV apagada → no hay evento.
drop function if exists public.publico_evento_por_codigo(text);

create or replace function public.publico_evento_por_codigo(p_codigo text)
returns table (
  id                       uuid,
  nombre                   text,
  estado                   public.estado_evento,
  fecha                    date,
  puestos_a_premiar        int,
  codigo_acceso            text,
  org_nombre               text,
  logo_url                 text,
  logo_subsede_url         text,
  sonido_revelacion_activo boolean,
  plantilla_publica        text,
  color_accento_hex        text,
  modo_revelacion_podio    text,
  flyer_url                text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.nombre,
    e.estado,
    e.fecha,
    e.puestos_a_premiar,
    e.codigo_acceso,
    o.nombre,
    o.logo_url,
    o.logo_subsede_url,
    coalesce(o.sonido_revelacion_activo, true),
    e.plantilla_publica,
    e.color_accento_hex,
    e.modo_revelacion_podio,
    e.flyer_url
  from public.eventos e
  join public.organizaciones o on o.id = e.organizacion_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
    and coalesce(e.tiene_tv_publica, true) = true
  limit 1;
$$;

revoke all on function public.publico_evento_por_codigo(text) from public;
grant execute on function public.publico_evento_por_codigo(text) to anon, authenticated;

-- 2) publico_categorias_publicadas: gate por TV.
drop function if exists public.publico_categorias_publicadas(text);

create or replace function public.publico_categorias_publicadas(p_codigo text)
returns table (
  categoria_id uuid,
  publicado_at timestamptz,
  paso_revelacion int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
begin
  select e.id into v_evento_id
  from public.eventos e
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
    and coalesce(e.tiene_tv_publica, true) = true
  limit 1;

  if v_evento_id is null then
    return;
  end if;

  return query
  select rp.categoria_id, rp.publicado_at, rp.paso_revelacion
  from public.resultados_publicados rp
  where rp.evento_id = v_evento_id
  order by rp.publicado_at desc;
end;
$$;

revoke all on function public.publico_categorias_publicadas(text) from public;
grant execute on function public.publico_categorias_publicadas(text) to anon, authenticated;

-- 3) publico_podio_categoria: gate por TV.
create or replace function public.publico_podio_categoria(p_codigo text, p_categoria_id uuid)
returns table (
  puesto int,
  participante_id uuid,
  codigo text,
  nombre_completo text,
  puntaje_final numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
  v_lim int;
begin
  select e.id, e.puestos_a_premiar into v_evento_id, v_lim
  from public.eventos e
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
    and coalesce(e.tiene_tv_publica, true) = true
  limit 1;

  if v_evento_id is null then
    return;
  end if;

  v_lim := case coalesce(v_lim, 0) when 2 then 2 else 3 end;

  if not exists (
    select 1
    from public.categorias c
    where c.id = p_categoria_id
      and c.evento_id = v_evento_id
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.resultados_publicados rp
    where rp.evento_id = v_evento_id
      and rp.categoria_id = p_categoria_id
  ) then
    return;
  end if;

  return query
  select
    (ranked.puesto)::integer as puesto,
    ranked.participante_id,
    ranked.codigo,
    ranked.nombre_completo,
    ranked.puntaje_final
  from (
    select
      row_number() over (order by pf.puntaje_final desc, pf.nombre_completo asc) as puesto,
      pf.participante_id,
      pf.codigo,
      pf.nombre_completo,
      pf.puntaje_final
    from public._puntajes_finales_categoria(p_categoria_id) pf
  ) ranked
  where ranked.puesto <= v_lim
  order by ranked.puesto;
end;
$$;

-- 4) publico_progreso_por_codigo: gate por TV (mantener firma original).
create or replace function public.publico_progreso_por_codigo(p_codigo text)
returns table (
  categoria_id uuid,
  categoria_nombre text,
  orden int,
  total_participantes bigint,
  num_jurados bigint,
  num_criterios bigint,
  calificaciones_registradas bigint,
  calificaciones_esperadas bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
  v_jurados bigint;
  v_crit bigint;
begin
  select e.id into v_evento_id
  from public.eventos e
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
    and coalesce(e.tiene_tv_publica, true) = true
  limit 1;

  if v_evento_id is null then
    return;
  end if;

  select count(*) into v_jurados from public.jurados j where j.evento_id = v_evento_id;
  select count(*) into v_crit from public.criterios c where c.evento_id = v_evento_id;

  return query
  select
    cat.id,
    cat.nombre,
    cat.orden,
    (select count(*)::bigint from public.participantes p where p.categoria_id = cat.id),
    v_jurados,
    v_crit,
    (
      select count(*)::bigint
      from public.calificaciones ca
      join public.participantes p on p.id = ca.participante_id
      where p.categoria_id = cat.id
    ),
    (
      (select count(*)::bigint from public.participantes p where p.categoria_id = cat.id)
      * v_jurados * v_crit
    )
  from public.categorias cat
  where cat.evento_id = v_evento_id
  order by cat.orden;
end;
$$;
