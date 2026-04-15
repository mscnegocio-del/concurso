-- Migración: agregar flyer_url y tiene_tv_publica a eventos, crear bucket eventos-flyers

-- 1. Columna flyer_url en eventos
alter table public.eventos
  add column if not exists flyer_url text default null;

comment on column public.eventos.flyer_url is
  'URL pública en Storage (bucket eventos-flyers). Opcional. Se muestra en pantalla pública cuando estado = abierto.';

-- 2. Columna tiene_tv_publica en eventos
alter table public.eventos
  add column if not exists tiene_tv_publica boolean not null default true;

comment on column public.eventos.tiene_tv_publica is
  'Si false, el panel Administrador oculta sección Sala/TV; la pantalla pública sigue accesible.';

-- 3. Bucket para flyers de eventos (separado de org-logos)
insert into storage.buckets (id, name, public)
values ('eventos-flyers', 'eventos-flyers', true)
on conflict (id) do update set public = excluded.public;

-- Política: lectura pública
drop policy if exists eventos_flyers_select on storage.objects;
create policy eventos_flyers_select on storage.objects
for select to public
using (bucket_id = 'eventos-flyers');

-- Política: solo admin de la org puede subir
-- Path esperado: {org_id}/{evento_id}/flyer-{timestamp}.{ext}
drop policy if exists eventos_flyers_admin_insert on storage.objects;
create policy eventos_flyers_admin_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'eventos-flyers'
  and public.current_user_role() in ('admin', 'super_admin')
  and split_part(name, '/', 1) = public.current_user_org_id()::text
);

drop policy if exists eventos_flyers_admin_update on storage.objects;
create policy eventos_flyers_admin_update on storage.objects
for update to authenticated
using (
  bucket_id = 'eventos-flyers'
  and public.current_user_role() in ('admin', 'super_admin')
  and split_part(name, '/', 1) = public.current_user_org_id()::text
)
with check (
  bucket_id = 'eventos-flyers'
  and public.current_user_role() in ('admin', 'super_admin')
  and split_part(name, '/', 1) = public.current_user_org_id()::text
);

drop policy if exists eventos_flyers_admin_delete on storage.objects;
create policy eventos_flyers_admin_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'eventos-flyers'
  and public.current_user_role() in ('admin', 'super_admin')
  and split_part(name, '/', 1) = public.current_user_org_id()::text
);

-- 4. Actualizar RPC publico_evento_por_codigo para exponer flyer_url
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
  limit 1;
$$;

revoke all on function public.publico_evento_por_codigo(text) from public;
grant execute on function public.publico_evento_por_codigo(text) to anon, authenticated;
