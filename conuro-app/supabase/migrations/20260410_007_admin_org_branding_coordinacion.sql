-- Admin org: logos (Storage + update RLS), sonido público opcional, coordinador historial con autor, jurado logo en login

-- Cambio de firma/OUT: Postgres exige DROP antes de recrear
drop function if exists public.buscar_evento_por_codigo(text);
drop function if exists public.publico_evento_por_codigo(text);
drop function if exists public.coordinador_resultados_publicados_lista(uuid);

alter table public.organizaciones
  add column if not exists sonido_revelacion_activo boolean not null default true;

-- Admin de la org puede actualizar datos de su organización (logos, sonido)
drop policy if exists org_update_admin on public.organizaciones;
create policy org_update_admin on public.organizaciones
for update to authenticated
using (
  public.current_user_role() = 'admin'
  and id = public.current_user_org_id()
)
with check (
  public.current_user_role() = 'admin'
  and id = public.current_user_org_id()
);

-- Bucket público para logos (URL estable en PDF/TV/panel)
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists org_logos_select on storage.objects;
create policy org_logos_select on storage.objects
for select to public
using (bucket_id = 'org-logos');

drop policy if exists org_logos_admin_insert on storage.objects;
create policy org_logos_admin_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'org-logos'
  and public.current_user_role() = 'admin'
  and split_part(name, '/', 1) = public.current_user_org_id()::text
);

drop policy if exists org_logos_admin_update on storage.objects;
create policy org_logos_admin_update on storage.objects
for update to authenticated
using (
  bucket_id = 'org-logos'
  and public.current_user_role() = 'admin'
  and split_part(name, '/', 1) = public.current_user_org_id()::text
)
with check (
  bucket_id = 'org-logos'
  and public.current_user_role() = 'admin'
  and split_part(name, '/', 1) = public.current_user_org_id()::text
);

drop policy if exists org_logos_admin_delete on storage.objects;
create policy org_logos_admin_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'org-logos'
  and public.current_user_role() = 'admin'
  and split_part(name, '/', 1) = public.current_user_org_id()::text
);

-- Jurado: logo institucional al ingresar
create or replace function public.buscar_evento_por_codigo(p_codigo text)
returns table (
  id uuid,
  nombre text,
  estado public.estado_evento,
  logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nombre, e.estado, o.logo_url
  from public.eventos e
  join public.organizaciones o on o.id = e.organizacion_id
  where upper(trim(e.codigo_acceso::text)) = upper(trim(p_codigo))
    and e.estado in ('abierto', 'calificando')
  limit 1;
$$;

revoke all on function public.buscar_evento_por_codigo(text) from public;
grant execute on function public.buscar_evento_por_codigo(text) to anon, authenticated;

-- Pantalla pública: preferencia de sonido
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
  sonido_revelacion_activo boolean
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
    coalesce(o.sonido_revelacion_activo, true)
  from public.eventos e
  join public.organizaciones o on o.id = e.organizacion_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  limit 1;
$$;

revoke all on function public.publico_evento_por_codigo(text) from public;
grant execute on function public.publico_evento_por_codigo(text) to anon, authenticated;

-- Historial publicaciones con quién publicó
create or replace function public.coordinador_resultados_publicados_lista(p_evento_id uuid)
returns table (
  categoria_id uuid,
  publicado_at timestamptz,
  publicado_por uuid,
  nombre_publicador text
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
    end as nombre_publicador
  from public.resultados_publicados rp
  left join public.usuarios u on u.id = rp.publicado_por
  where rp.evento_id = p_evento_id
  order by rp.publicado_at desc;
end;
$$;

revoke all on function public.coordinador_resultados_publicados_lista(uuid) from public;
grant execute on function public.coordinador_resultados_publicados_lista(uuid) to authenticated;
