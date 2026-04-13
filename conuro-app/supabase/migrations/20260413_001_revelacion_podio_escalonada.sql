-- Revelacion de podio por categoria: simultaneo o escalonado.
-- Incluye control de pasos, bloqueo de categoria activa y funciones publicas/coordinacion.

alter table public.eventos
  add column if not exists modo_revelacion_podio text not null default 'simultaneo';

alter table public.eventos
  drop constraint if exists eventos_modo_revelacion_podio_check;

alter table public.eventos
  add constraint eventos_modo_revelacion_podio_check
  check (modo_revelacion_podio in ('simultaneo', 'escalonado'));

comment on column public.eventos.modo_revelacion_podio is 'simultaneo|escalonado para podio publico por categoria';

alter table public.resultados_publicados
  add column if not exists paso_revelacion int not null default 0;

alter table public.resultados_publicados
  drop constraint if exists resultados_publicados_paso_revelacion_check;

alter table public.resultados_publicados
  add constraint resultados_publicados_paso_revelacion_check
  check (paso_revelacion >= 0 and paso_revelacion <= 3);

create or replace function public._validar_paso_revelacion_resultados_publicados()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_puestos int;
begin
  select e.puestos_a_premiar
  into v_puestos
  from public.eventos e
  where e.id = new.evento_id;

  if v_puestos is null then
    raise exception 'Evento invalido para resultados_publicados';
  end if;

  if new.paso_revelacion < 0 or new.paso_revelacion > v_puestos then
    raise exception 'paso_revelacion fuera de rango para este evento';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_paso_revelacion_resultados_publicados on public.resultados_publicados;
create trigger trg_validar_paso_revelacion_resultados_publicados
before insert or update on public.resultados_publicados
for each row
execute function public._validar_paso_revelacion_resultados_publicados();

-- Compatibilidad hacia atras: resultados ya publicados pasan a "completo".
update public.resultados_publicados rp
set paso_revelacion = case coalesce(e.puestos_a_premiar, 3) when 2 then 2 else 3 end
from public.eventos e
where e.id = rp.evento_id
  and rp.paso_revelacion = 0;

drop function if exists public.publico_evento_por_codigo(text);
create or replace function public.publico_evento_por_codigo(p_codigo text)
returns table (
  id uuid,
  nombre text,
  estado public.estado_evento,
  fecha date,
  puestos_a_premiar int,
  codigo_acceso text,
  org_nombre text,
  logo_url text,
  sonido_revelacion_activo boolean,
  plantilla_publica text,
  color_accento_hex text,
  modo_revelacion_podio text
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
    coalesce(o.sonido_revelacion_activo, true),
    e.plantilla_publica,
    e.color_accento_hex,
    e.modo_revelacion_podio
  from public.eventos e
  join public.organizaciones o on o.id = e.organizacion_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  limit 1;
$$;

revoke all on function public.publico_evento_por_codigo(text) from public;
grant execute on function public.publico_evento_por_codigo(text) to anon, authenticated;

drop function if exists public.coordinador_progreso_evento(uuid);
create or replace function public.coordinador_progreso_evento(p_evento_id uuid)
returns table (
  categoria_id uuid,
  categoria_nombre text,
  orden int,
  total_participantes bigint,
  num_jurados bigint,
  num_criterios bigint,
  calificaciones_registradas bigint,
  calificaciones_esperadas bigint,
  publicado boolean,
  paso_revelacion int
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
    end,
    (rp.categoria_id is not null) as publicado,
    coalesce(rp.paso_revelacion, 0) as paso_revelacion
  from public.categorias cat
  left join public.resultados_publicados rp
    on rp.evento_id = p_evento_id
   and rp.categoria_id = cat.id
  where cat.evento_id = p_evento_id
  order by cat.orden;
end;
$$;

revoke all on function public.coordinador_progreso_evento(uuid) from public;
grant execute on function public.coordinador_progreso_evento(uuid) to authenticated;

drop function if exists public.coordinador_resultados_publicados_lista(uuid);
create or replace function public.coordinador_resultados_publicados_lista(p_evento_id uuid)
returns table (
  categoria_id uuid,
  publicado_at timestamptz,
  publicado_por uuid,
  nombre_publicador text,
  paso_revelacion int
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
  select
    rp.categoria_id,
    rp.publicado_at,
    rp.publicado_por,
    case
      when rp.publicado_por is null then 'Sin registro'::text
      else coalesce(
        nullif(trim(u.nombre_completo), ''),
        nullif(trim(u.email), ''),
        'Usuario'
      )
    end as nombre_publicador,
    coalesce(rp.paso_revelacion, 0)
  from public.resultados_publicados rp
  left join public.usuarios u on u.id = rp.publicado_por
  where rp.evento_id = p_evento_id
  order by rp.publicado_at desc;
end;
$$;

revoke all on function public.coordinador_resultados_publicados_lista(uuid) from public;
grant execute on function public.coordinador_resultados_publicados_lista(uuid) to authenticated;

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
    if v_paso_actual < v_puestos then
      update public.resultados_publicados
      set
        paso_revelacion = v_puestos,
        publicado_at = now(),
        publicado_por = auth.uid()
      where evento_id = p_evento_id and categoria_id = p_categoria_id
      returning paso_revelacion into v_paso_actual;
    end if;

    return query select v_paso_actual, (v_paso_actual >= v_puestos);
    return;
  end if;

  if v_paso_actual < v_puestos then
    update public.resultados_publicados
    set
      paso_revelacion = least(v_paso_actual + 1, v_puestos),
      publicado_at = now(),
      publicado_por = auth.uid()
    where evento_id = p_evento_id and categoria_id = p_categoria_id
    returning paso_revelacion into v_paso_actual;
  end if;

  return query select v_paso_actual, (v_paso_actual >= v_puestos);
end;
$$;

revoke all on function public.coordinador_avanzar_revelacion_categoria(uuid, uuid) from public;
grant execute on function public.coordinador_avanzar_revelacion_categoria(uuid, uuid) to authenticated;

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
  v_visible int;
  v_paso int;
  v_modo text;
begin
  select e.id, e.puestos_a_premiar, e.modo_revelacion_podio
  into v_evento_id, v_lim, v_modo
  from public.eventos e
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
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

  select rp.paso_revelacion
  into v_paso
  from public.resultados_publicados rp
  where rp.evento_id = v_evento_id
    and rp.categoria_id = p_categoria_id;

  if v_paso is null then
    return;
  end if;

  if v_modo = 'simultaneo' then
    v_visible := v_lim;
  else
    v_visible := greatest(0, least(v_paso, v_lim));
  end if;

  if v_visible <= 0 then
    return;
  end if;

  return query
  select
    ranked.puesto::int as puesto,
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
  where ranked.puesto between (v_lim - v_visible + 1) and v_lim
  order by ranked.puesto;
end;
$$;

-- Clonado: hereda modo de revelacion del evento origen.
create or replace function public.admin_clonar_evento(p_evento_origen_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.eventos%rowtype;
  v_new uuid;
  v_cod varchar(6);
  intentos int := 0;
  r_cat record;
begin
  select * into v_orig from public.eventos where id = p_evento_origen_id;
  if not found then
    raise exception 'Evento no encontrado';
  end if;

  if not public._admin_o_super_puede_org(v_orig.organizacion_id) then
    raise exception 'No autorizado';
  end if;

  loop
    v_cod := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    intentos := intentos + 1;
    exit when not exists (select 1 from public.eventos e where e.codigo_acceso = v_cod);
    exit when intentos > 24;
  end loop;

  if exists (select 1 from public.eventos e where e.codigo_acceso = v_cod) then
    raise exception 'No se pudo generar codigo unico';
  end if;

  insert into public.eventos (
    organizacion_id,
    nombre,
    descripcion,
    fecha,
    estado,
    codigo_acceso,
    puestos_a_premiar,
    plantilla_criterios_id,
    modo_revelacion_podio
  )
  values (
    v_orig.organizacion_id,
    trim(v_orig.nombre) || ' (copia)',
    v_orig.descripcion,
    v_orig.fecha,
    'borrador',
    v_cod,
    v_orig.puestos_a_premiar,
    null,
    coalesce(v_orig.modo_revelacion_podio, 'simultaneo')
  )
  returning id into v_new;

  insert into public.criterios (evento_id, nombre, puntaje_maximo, orden, es_criterio_desempate)
  select
    v_new,
    c.nombre,
    c.puntaje_maximo,
    c.orden,
    c.es_criterio_desempate
  from public.criterios c
  where c.evento_id = p_evento_origen_id;

  for r_cat in
    select * from public.categorias where evento_id = p_evento_origen_id order by orden
  loop
    insert into public.categorias (evento_id, nombre, orden)
    values (v_new, r_cat.nombre, r_cat.orden);
  end loop;

  return v_new;
end;
$$;

