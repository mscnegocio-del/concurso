-- Evita recursión RLS al consultar public.usuarios desde funciones de contexto.
-- SECURITY DEFINER permite evaluar auth.uid() y leer usuarios sin entrar en bucle de políticas.

create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.organizacion_id
  from public.usuarios u
  where u.id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_role()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select u.rol
  from public.usuarios u
  where u.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_user_org_id() from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_org_id() to anon, authenticated;
grant execute on function public.current_user_role() to anon, authenticated;
