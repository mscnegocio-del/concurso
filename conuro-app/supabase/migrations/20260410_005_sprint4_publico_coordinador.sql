-- Sprint 4: RPCs pantalla pública (anon) y panel coordinador + realtime

-- Cerrar fuga: antes anon podía leer todas las filas de resultados_publicados.
drop policy if exists resultados_publicados_read_public on public.resultados_publicados;

create policy resultados_publicados_select_org on public.resultados_publicados
for select to authenticated
using (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

-- Realtime (idempotente: ignora si ya está en la publicación)
do $$
begin
  begin
    alter publication supabase_realtime add table public.eventos;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.resultados_publicados;
  exception
    when duplicate_object then null;
  end;
end $$;

-- Cabecera evento por código de acceso (URL pública). No expone borradores.
create or replace function public.publico_evento_por_codigo(p_codigo text)
returns table (
  id uuid,
  nombre text,
  estado public.estado_evento,
  fecha date,
  puestos_a_premiar int,
  codigo_acceso text,
  org_nombre text,
  logo_url text
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
    o.logo_url
  from public.eventos e
  join public.organizaciones o on o.id = e.organizacion_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  limit 1;
$$;

revoke all on function public.publico_evento_por_codigo(text) from public;
grant execute on function public.publico_evento_por_codigo(text) to anon, authenticated;

-- Progreso por categoría (sin puntajes): cuenta calificaciones vs esperadas
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
      from public.calificaciones cal
      join public.participantes p2 on p2.id = cal.participante_id
      where p2.categoria_id = cat.id
    ),
    case
      when v_jurados = 0 or v_crit = 0 then 0::bigint
      else (
        select count(*)::bigint from public.participantes p where p.categoria_id = cat.id
      ) * v_jurados * v_crit
    end
  from public.categorias cat
  where cat.evento_id = v_evento_id
  order by cat.orden;
end;
$$;

revoke all on function public.publico_progreso_por_codigo(text) from public;
grant execute on function public.publico_progreso_por_codigo(text) to anon, authenticated;

-- Categorías ya reveladas al público (solo para el evento del código); sin lectura directa a la tabla.
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

-- Puntaje final por participante (promedio de sumas por jurado)
create or replace function public._puntajes_finales_categoria(p_categoria_id uuid)
returns table (
  participante_id uuid,
  codigo text,
  nombre_completo text,
  puntaje_final numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with por_jurado as (
    select
      c.participante_id,
      c.jurado_id,
      sum(c.puntaje) as suma_criterios
    from public.calificaciones c
    join public.participantes p on p.id = c.participante_id
    where p.categoria_id = p_categoria_id
    group by c.participante_id, c.jurado_id
  ),
  agregado as (
    select
      participante_id,
      round(avg(suma_criterios)::numeric, 2) as puntaje_final
    from por_jurado
    group by participante_id
  )
  select
    p.id,
    p.codigo,
    p.nombre_completo,
    coalesce(a.puntaje_final, 0::numeric) as puntaje_final
  from public.participantes p
  left join agregado a on a.participante_id = p.id
  where p.categoria_id = p_categoria_id;
$$;

-- Podio público solo si la categoría está publicada
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
  limit 1;

  if v_evento_id is null then
    return;
  end if;

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
    ranked.puesto,
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

revoke all on function public.publico_podio_categoria(text, uuid) from public;
grant execute on function public.publico_podio_categoria(text, uuid) to anon, authenticated;

revoke all on function public._puntajes_finales_categoria(uuid) from public;
-- Solo uso interno desde otras funciones security definer

-- ¿Usuario puede coordinar este evento? (admin o administrador de la org del evento)
create or replace function public._usuario_puede_evento(p_evento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.eventos e
    join public.usuarios u on u.organizacion_id = e.organizacion_id
    where e.id = p_evento_id
      and u.id = auth.uid()
      and u.rol in ('admin', 'administrador', 'super_admin')
  );
$$;

revoke all on function public._usuario_puede_evento(uuid) from public;

create or replace function public.coordinador_progreso_evento(p_evento_id uuid)
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
  v_ok boolean;
  v_jurados bigint;
  v_crit bigint;
begin
  select public._usuario_puede_evento(p_evento_id) into v_ok;
  if not v_ok then
    raise exception 'No autorizado';
  end if;

  select count(*) into v_jurados from public.jurados j where j.evento_id = p_evento_id;
  select count(*) into v_crit from public.criterios c where c.evento_id = p_evento_id;

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
      from public.calificaciones cal
      join public.participantes p2 on p2.id = cal.participante_id
      where p2.categoria_id = cat.id
    ),
    case
      when v_jurados = 0 or v_crit = 0 then 0::bigint
      else (
        select count(*)::bigint from public.participantes p where p.categoria_id = cat.id
      ) * v_jurados * v_crit
    end
  from public.categorias cat
  where cat.evento_id = p_evento_id
  order by cat.orden;
end;
$$;

revoke all on function public.coordinador_progreso_evento(uuid) from public;
grant execute on function public.coordinador_progreso_evento(uuid) to authenticated;

create or replace function public.coordinador_ranking_categoria(p_evento_id uuid, p_categoria_id uuid)
returns table (
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
  v_ok boolean;
begin
  select public._usuario_puede_evento(p_evento_id) into v_ok;
  if not v_ok then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1 from public.categorias c
    where c.id = p_categoria_id and c.evento_id = p_evento_id
  ) then
    raise exception 'Categoría inválida';
  end if;

  return query
  select
    pf.participante_id,
    pf.codigo,
    pf.nombre_completo,
    pf.puntaje_final
  from public._puntajes_finales_categoria(p_categoria_id) pf
  order by pf.puntaje_final desc, pf.nombre_completo asc;
end;
$$;

revoke all on function public.coordinador_ranking_categoria(uuid, uuid) from public;
grant execute on function public.coordinador_ranking_categoria(uuid, uuid) to authenticated;

create or replace function public.coordinador_resultados_publicados_lista(p_evento_id uuid)
returns table (
  categoria_id uuid,
  publicado_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  select public._usuario_puede_evento(p_evento_id) into v_ok;
  if not v_ok then
    raise exception 'No autorizado';
  end if;

  return query
  select rp.categoria_id, rp.publicado_at
  from public.resultados_publicados rp
  where rp.evento_id = p_evento_id
  order by rp.publicado_at desc;
end;
$$;

revoke all on function public.coordinador_resultados_publicados_lista(uuid) from public;
grant execute on function public.coordinador_resultados_publicados_lista(uuid) to authenticated;
