-- Plantilla pantalla pública (TV) y color de acento opcional por evento

alter table public.eventos
  add column if not exists plantilla_publica text not null default 'oscuro',
  add column if not exists color_accento_hex text null;

alter table public.eventos
  drop constraint if exists eventos_plantilla_publica_check;

alter table public.eventos
  add constraint eventos_plantilla_publica_check
  check (plantilla_publica in ('oscuro', 'claro'));

comment on column public.eventos.plantilla_publica is 'Tema visual pantalla pública: oscuro | claro';
comment on column public.eventos.color_accento_hex is 'Color acento opcional #RRGGBB para armonizar con logo; null = default del tema';

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
  color_accento_hex text
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
    e.color_accento_hex
  from public.eventos e
  join public.organizaciones o on o.id = e.organizacion_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  limit 1;
$$;

revoke all on function public.publico_evento_por_codigo(text) from public;
grant execute on function public.publico_evento_por_codigo(text) to anon, authenticated;
