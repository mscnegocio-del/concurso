-- Agrega soporte para modal de desempate controlado desde admin → TV pública via Realtime

-- 1. Columna desempate_activo en resultados_publicados (null = modal oculto, JSON = modal visible)
alter table public.resultados_publicados
  add column if not exists desempate_activo jsonb default null;

comment on column public.resultados_publicados.desempate_activo is
  'JSON con {puesto, criterioDesempate, participante1, participante2} cuando modal está visible en TV. Null cuando está oculto.';

-- 2. RPC para que admin active/desactive el modal de desempate en la TV
create or replace function public.coordinador_toggle_desempate(
  p_evento_id    uuid,
  p_categoria_id uuid,
  p_payload      jsonb  -- null = ocultar, objeto con DesempateInfo = mostrar
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.resultados_publicados
    where evento_id = p_evento_id and categoria_id = p_categoria_id
  ) then
    raise exception 'La categoría no está publicada aún';
  end if;

  update public.resultados_publicados
    set desempate_activo = p_payload
    where evento_id = p_evento_id and categoria_id = p_categoria_id;
end;
$$;

revoke all on function public.coordinador_toggle_desempate(uuid, uuid, jsonb) from public;
grant execute on function public.coordinador_toggle_desempate(uuid, uuid, jsonb) to authenticated;

-- 3. Extender coordinador_ranking_categoria para incluir promedio por criterio
drop function if exists public.coordinador_ranking_categoria(uuid, uuid);

create or replace function public.coordinador_ranking_categoria(p_evento_id uuid, p_categoria_id uuid)
returns table (
  participante_id       uuid,
  codigo                text,
  nombre_completo       text,
  puntaje_final         numeric,
  promedio_por_criterio jsonb   -- {criterio_id: promedio_redondeado}
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
  with por_jurado_criterio as (
    -- promedio de cada criterio entre todos los jurados
    select
      c.participante_id,
      c.criterio_id,
      round(avg(c.puntaje)::numeric, 2) as promedio_criterio
    from public.calificaciones c
    join public.participantes p on p.id = c.participante_id
    where p.categoria_id = p_categoria_id
    group by c.participante_id, c.criterio_id
  ),
  criterio_json as (
    select
      por_jurado_criterio.participante_id,
      jsonb_object_agg(por_jurado_criterio.criterio_id::text, por_jurado_criterio.promedio_criterio) as promedio_por_criterio
    from por_jurado_criterio
    group by por_jurado_criterio.participante_id
  )
  select
    pf.participante_id,
    pf.codigo,
    pf.nombre_completo,
    pf.puntaje_final,
    coalesce(cj.promedio_por_criterio, '{}'::jsonb) as promedio_por_criterio
  from public._puntajes_finales_categoria(p_categoria_id) pf
  left join criterio_json cj on cj.participante_id = pf.participante_id
  order by pf.puntaje_final desc, pf.nombre_completo asc;
end;
$$;

revoke all on function public.coordinador_ranking_categoria(uuid, uuid) from public;
grant execute on function public.coordinador_ranking_categoria(uuid, uuid) to authenticated;

-- 4. Actualizar RPC pública para exponer desempate_activo y paso_revelacion
drop function if exists public.publico_categorias_publicadas(text);

create or replace function public.publico_categorias_publicadas(p_codigo text)
returns table (
  categoria_id     uuid,
  publicado_at     timestamptz,
  paso_revelacion  int,
  desempate_activo jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rp.categoria_id,
    rp.publicado_at,
    rp.paso_revelacion,
    rp.desempate_activo
  from public.resultados_publicados rp
  join public.eventos e on e.id = rp.evento_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  order by rp.publicado_at desc;
$$;

revoke all on function public.publico_categorias_publicadas(text) from public;
grant execute on function public.publico_categorias_publicadas(text) to anon, authenticated;
