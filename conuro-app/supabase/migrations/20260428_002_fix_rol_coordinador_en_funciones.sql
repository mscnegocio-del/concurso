-- Fix: actualizar políticas RLS y funciones que aún usan el valor 'administrador'
-- del enum rol_usuario, renombrado a 'coordinador' en migración 20260428_001.

-- 1. Policy calificaciones_admin_access (USING + WITH CHECK)
drop policy if exists calificaciones_admin_access on public.calificaciones;
create policy calificaciones_admin_access on public.calificaciones
for all to authenticated
using (
  public.current_user_role() in ('admin', 'coordinador', 'super_admin')
  and exists (
    select 1
    from public.participantes p
    join public.categorias c on c.id = p.categoria_id
    join public.eventos e on e.id = c.evento_id
    where p.id = participante_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
)
with check (
  public.current_user_role() in ('admin', 'coordinador', 'super_admin')
  and exists (
    select 1
    from public.participantes p
    join public.categorias c on c.id = p.categoria_id
    join public.eventos e on e.id = c.evento_id
    where p.id = participante_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

-- 2. Policy audit_read_admin
drop policy if exists audit_read_admin on public.audit_log;
create policy audit_read_admin on public.audit_log
for select to authenticated
using (
  (
    public.current_user_role() in ('admin', 'coordinador')
    and organizacion_id = public.current_user_org_id()
  )
  or public.current_user_role() = 'super_admin'
);

-- 3. Función _usuario_puede_evento
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
      and u.rol in ('admin', 'coordinador', 'super_admin')
  );
$$;

revoke all on function public._usuario_puede_evento(uuid) from public;
