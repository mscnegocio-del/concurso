-- Idempotente: sustituye registrar_o_buscar_jurado si ya existía con otra firma.
drop function if exists public.registrar_o_buscar_jurado(uuid, text);

-- Token de sesión por jurado (sin Supabase Auth): rota en cada login.
alter table public.jurados
  add column if not exists token_sesion uuid not null default gen_random_uuid();

create unique index if not exists ux_jurados_token_sesion on public.jurados (token_sesion);

-- Reemplaza función de registro para devolver y rotar token
create or replace function public.registrar_o_buscar_jurado(
  p_evento_id uuid,
  p_nombre_completo text
)
returns table (
  jurado_id uuid,
  nombre_completo text,
  orden int,
  token_sesion uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := trim(p_nombre_completo);
  v_id uuid;
  v_ord int;
  v_nom text;
  v_token uuid;
begin
  if v_nombre is null or length(v_nombre) < 2 then
    raise exception 'Nombre invalido';
  end if;

  if not exists (
    select 1 from public.eventos e
    where e.id = p_evento_id and e.estado in ('abierto', 'calificando')
  ) then
    raise exception 'Evento no disponible';
  end if;

  select j.id, j.nombre_completo, j.orden
  into v_id, v_nom, v_ord
  from public.jurados j
  where j.evento_id = p_evento_id
    and lower(trim(j.nombre_completo)) = lower(v_nombre)
  limit 1;

  if v_id is not null then
    update public.jurados j
    set token_sesion = gen_random_uuid()
    where j.id = v_id
    returning j.token_sesion into v_token;

    return query select v_id, v_nom, v_ord, v_token;
    return;
  end if;

  insert into public.jurados (evento_id, nombre_completo, orden, token_sesion)
  values (
    p_evento_id,
    v_nombre,
    coalesce(
      (select max(j2.orden) + 1 from public.jurados j2 where j2.evento_id = p_evento_id),
      1
    ),
    gen_random_uuid()
  )
  returning id, nombre_completo, orden, token_sesion
  into v_id, v_nom, v_ord, v_token;

  return query select v_id, v_nom, v_ord, v_token;
end;
$$;

revoke all on function public.registrar_o_buscar_jurado(uuid, text) from public;
grant execute on function public.registrar_o_buscar_jurado(uuid, text) to anon, authenticated;

create or replace function public.jurado_resolver_sesion(p_token uuid)
returns table (
  jurado_id uuid,
  evento_id uuid,
  evento_nombre text,
  evento_estado public.estado_evento,
  jurado_nombre text,
  jurado_orden int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.id,
    e.id,
    e.nombre,
    e.estado,
    j.nombre_completo,
    j.orden
  from public.jurados j
  join public.eventos e on e.id = j.evento_id
  where j.token_sesion = p_token
  limit 1;
$$;

revoke all on function public.jurado_resolver_sesion(uuid) from public;
grant execute on function public.jurado_resolver_sesion(uuid) to anon, authenticated;

create or replace function public.jurado_listar_criterios(p_token uuid)
returns table (
  id uuid,
  nombre text,
  puntaje_maximo numeric,
  orden int,
  es_criterio_desempate boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre, c.puntaje_maximo, c.orden, c.es_criterio_desempate
  from public.criterios c
  join public.jurados j on j.evento_id = c.evento_id
  where j.token_sesion = p_token
  order by c.orden;
$$;

revoke all on function public.jurado_listar_criterios(uuid) from public;
grant execute on function public.jurado_listar_criterios(uuid) to anon, authenticated;

create or replace function public.jurado_listar_categorias(p_token uuid)
returns table (
  id uuid,
  nombre text,
  orden int,
  total_participantes bigint,
  participantes_completos bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
  v_jurado_id uuid;
  n_crit int;
begin
  select j.evento_id, j.id into v_evento_id, v_jurado_id
  from public.jurados j
  where j.token_sesion = p_token
  limit 1;

  if v_jurado_id is null then
    raise exception 'Sesion invalida';
  end if;

  select count(*)::int into n_crit from public.criterios c where c.evento_id = v_evento_id;

  return query
  select
    cat.id,
    cat.nombre,
    cat.orden,
    (select count(*)::bigint from public.participantes p where p.categoria_id = cat.id) as tot,
    (
      select count(*)::bigint
      from public.participantes p
      where p.categoria_id = cat.id
        and n_crit > 0
        and (
          select count(*)::int
          from public.calificaciones cal
          where cal.participante_id = p.id and cal.jurado_id = v_jurado_id
        ) >= n_crit
    ) as completos
  from public.categorias cat
  where cat.evento_id = v_evento_id
  order by cat.orden;
end;
$$;

revoke all on function public.jurado_listar_categorias(uuid) from public;
grant execute on function public.jurado_listar_categorias(uuid) to anon, authenticated;

create or replace function public.jurado_listar_participantes(
  p_token uuid,
  p_categoria_id uuid
)
returns table (
  id uuid,
  codigo text,
  nombre_completo text,
  completo boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jurado_id uuid;
  v_evento_id uuid;
  n_crit int;
begin
  select j.id, j.evento_id into v_jurado_id, v_evento_id
  from public.jurados j
  where j.token_sesion = p_token
  limit 1;

  if v_jurado_id is null then
    raise exception 'Sesion invalida';
  end if;

  if not exists (
    select 1 from public.categorias c
    where c.id = p_categoria_id and c.evento_id = v_evento_id
  ) then
    raise exception 'Categoria invalida';
  end if;

  select count(*)::int into n_crit from public.criterios c where c.evento_id = v_evento_id;

  return query
  select
    p.id,
    p.codigo::text,
    p.nombre_completo,
    (
      n_crit > 0
      and (select count(*)::int
       from public.calificaciones cal
       where cal.participante_id = p.id and cal.jurado_id = v_jurado_id) >= n_crit
    ) as completo
  from public.participantes p
  where p.categoria_id = p_categoria_id
  order by length(trim(p.codigo::text)), trim(p.codigo::text);
end;
$$;

revoke all on function public.jurado_listar_participantes(uuid, uuid) from public;
grant execute on function public.jurado_listar_participantes(uuid, uuid) to anon, authenticated;

create or replace function public.jurado_obtener_mis_calificaciones(
  p_token uuid,
  p_participante_id uuid
)
returns table (criterio_id uuid, puntaje numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jurado_id uuid;
  v_evento_id uuid;
begin
  select j.id, j.evento_id into v_jurado_id, v_evento_id
  from public.jurados j
  where j.token_sesion = p_token
  limit 1;

  if v_jurado_id is null then
    raise exception 'Sesion invalida';
  end if;

  if not exists (
    select 1
    from public.participantes p
    join public.categorias c on c.id = p.categoria_id
    where p.id = p_participante_id and c.evento_id = v_evento_id
  ) then
    raise exception 'Participante invalido';
  end if;

  return query
  select cal.criterio_id, cal.puntaje
  from public.calificaciones cal
  where cal.jurado_id = v_jurado_id and cal.participante_id = p_participante_id;
end;
$$;

revoke all on function public.jurado_obtener_mis_calificaciones(uuid, uuid) from public;
grant execute on function public.jurado_obtener_mis_calificaciones(uuid, uuid) to anon, authenticated;

create or replace function public.jurado_guardar_calificacion(
  p_token uuid,
  p_participante_id uuid,
  p_criterio_id uuid,
  p_puntaje numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jurado public.jurados%rowtype;
  v_evento public.eventos%rowtype;
  v_criterio public.criterios%rowtype;
begin
  select * into v_jurado from public.jurados where token_sesion = p_token limit 1;
  if not found then
    raise exception 'Sesion invalida';
  end if;

  select * into v_evento from public.eventos where id = v_jurado.evento_id;

  if v_evento.estado <> 'calificando' then
    raise exception 'El evento no permite calificar en este momento';
  end if;

  if not exists (
    select 1
    from public.participantes p
    join public.categorias c on c.id = p.categoria_id
    where p.id = p_participante_id and c.evento_id = v_evento.id
  ) then
    raise exception 'Participante invalido';
  end if;

  select * into v_criterio
  from public.criterios
  where id = p_criterio_id and evento_id = v_evento.id;

  if not found then
    raise exception 'Criterio invalido';
  end if;

  if p_puntaje < 0 or p_puntaje > v_criterio.puntaje_maximo then
    raise exception 'Puntaje fuera de rango';
  end if;

  insert into public.calificaciones (jurado_id, participante_id, criterio_id, puntaje)
  values (v_jurado.id, p_participante_id, p_criterio_id, p_puntaje)
  on conflict (jurado_id, participante_id, criterio_id)
  do update set puntaje = excluded.puntaje, updated_at = now();
end;
$$;

revoke all on function public.jurado_guardar_calificacion(uuid, uuid, uuid, numeric) from public;
grant execute on function public.jurado_guardar_calificacion(uuid, uuid, uuid, numeric) to anon, authenticated;
