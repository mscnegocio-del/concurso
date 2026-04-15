-- Corrige RPC publico_evento_por_codigo para incluir logo_subsede_url.
-- La migración 20260413_001 recreó la función sin este campo,
-- dejando la pantalla pública sin poder mostrar el logo de subsede.

drop function if exists public.publico_evento_por_codigo(text);

create or replace function public.publico_evento_por_codigo(p_codigo text)
returns table (
  id                      uuid,
  nombre                  text,
  estado                  public.estado_evento,
  fecha                   date,
  puestos_a_premiar       int,
  codigo_acceso           text,
  org_nombre              text,
  logo_url                text,
  logo_subsede_url        text,
  sonido_revelacion_activo boolean,
  plantilla_publica       text,
  color_accento_hex       text,
  modo_revelacion_podio   text
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
    e.modo_revelacion_podio
  from public.eventos e
  join public.organizaciones o on o.id = e.organizacion_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  limit 1;
$$;

revoke all on function public.publico_evento_por_codigo(text) from public;
grant execute on function public.publico_evento_por_codigo(text) to anon, authenticated;
