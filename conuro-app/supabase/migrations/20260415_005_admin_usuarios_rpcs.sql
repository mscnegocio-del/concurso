-- Migration: RPC functions for user management
-- Date: 2026-04-15

-- RPC to delete a user (only admin of same org or super_admin)
CREATE OR REPLACE FUNCTION admin_eliminar_usuario(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get the organization of the user to be deleted
  SELECT organizacion_id INTO v_org_id FROM public.usuarios WHERE id = p_usuario_id;

  -- Check permissions
  IF NOT (
    public.current_user_role() = 'super_admin'
    OR (
      public.current_user_role() IN ('admin')
      AND v_org_id = public.current_user_org_id()
    )
  ) THEN
    RAISE EXCEPTION 'No tienes permisos para eliminar este usuario';
  END IF;

  -- Cannot delete self
  IF p_usuario_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta';
  END IF;

  -- Delete from auth.users (cascades to public.usuarios)
  DELETE FROM auth.users WHERE id = p_usuario_id;
END;
$$;

-- RPC to list users of an organization
CREATE OR REPLACE FUNCTION admin_listar_usuarios(p_org_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  email text,
  nombre_completo text,
  rol text,
  created_at timestamptz,
  email_confirmado boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.id,
    u.email,
    u.nombre_completo,
    u.rol::text,
    u.created_at,
    au.email_confirmed_at IS NOT NULL as email_confirmado
  FROM public.usuarios u
  LEFT JOIN auth.users au ON au.id = u.id
  WHERE u.organizacion_id = COALESCE(p_org_id, public.current_user_org_id())
  AND (
    public.current_user_role() = 'super_admin'
    OR u.organizacion_id = public.current_user_org_id()
  )
  ORDER BY u.created_at DESC;
$$;
