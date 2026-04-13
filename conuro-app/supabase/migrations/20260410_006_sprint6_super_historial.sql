-- Sprint 6: super admin CRUD orgs (RLS), clonado de evento, helpers

create or replace function public._admin_o_super_puede_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and (
        u.rol = 'super_admin'
        or (u.rol = 'admin' and u.organizacion_id = p_org)
      )
  );
$$;

revoke all on function public._admin_o_super_puede_org(uuid) from public;

-- Clona evento: categorías + criterios; sin participantes, jurados ni calificaciones.
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
    plantilla_criterios_id
  )
  values (
    v_orig.organizacion_id,
    trim(v_orig.nombre) || ' (copia)',
    v_orig.descripcion,
    v_orig.fecha,
    'borrador',
    v_cod,
    v_orig.puestos_a_premiar,
    null
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

revoke all on function public.admin_clonar_evento(uuid) from public;
grant execute on function public.admin_clonar_evento(uuid) to authenticated;

-- Super admin puede crear/editar organizaciones
drop policy if exists org_insert_super_admin on public.organizaciones;
create policy org_insert_super_admin on public.organizaciones
for insert to authenticated
with check (public.current_user_role() = 'super_admin');

drop policy if exists org_update_super_admin on public.organizaciones;
create policy org_update_super_admin on public.organizaciones
for update to authenticated
using (public.current_user_role() = 'super_admin')
with check (public.current_user_role() = 'super_admin');
