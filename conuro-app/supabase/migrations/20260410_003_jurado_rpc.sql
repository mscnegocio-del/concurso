-- Acceso público controlado para ingreso de jurado (sin Supabase Auth).
-- SECURITY DEFINER evita exponer listados completos de eventos.

create or replace function public.buscar_evento_por_codigo(p_codigo text)
returns table (
  id uuid,
  nombre text,
  estado public.estado_evento
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nombre, e.estado
  from public.eventos e
  where upper(trim(e.codigo_acceso::text)) = upper(trim(p_codigo))
    and e.estado in ('abierto', 'calificando')
  limit 1;
$$;

revoke all on function public.buscar_evento_por_codigo(text) from public;
grant execute on function public.buscar_evento_por_codigo(text) to anon, authenticated;

create or replace function public.registrar_o_buscar_jurado(
  p_evento_id uuid,
  p_nombre_completo text
)
returns table (
  jurado_id uuid,
  nombre_completo text,
  orden int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := trim(p_nombre_completo);
  v_id uuid;
  v_ord int;
  v_nom text;
begin
  if v_nombre is null or length(v_nombre) < 2 then
    raise exception 'Nombre invalido';
  end if;

  if not exists (
    select 1 from public.eventos e
    where e.id = p_evento_id and e.estado in ('abierto', 'calificando')
  ) then
    raise exception 'Evento no disponible';
  end if;

  select j.id, j.nombre_completo, j.orden
  into v_id, v_nom, v_ord
  from public.jurados j
  where j.evento_id = p_evento_id
    and lower(trim(j.nombre_completo)) = lower(v_nombre)
  limit 1;

  if v_id is not null then
    return query select v_id, v_nom, v_ord;
    return;
  end if;

  insert into public.jurados (evento_id, nombre_completo, orden)
  values (
    p_evento_id,
    v_nombre,
    coalesce(
      (select max(j2.orden) + 1 from public.jurados j2 where j2.evento_id = p_evento_id),
      1
    )
  )
  returning id, nombre_completo, orden
  into v_id, v_nom, v_ord;

  return query select v_id, v_nom, v_ord;
end;
$$;

revoke all on function public.registrar_o_buscar_jurado(uuid, text) from public;
grant execute on function public.registrar_o_buscar_jurado(uuid, text) to anon, authenticated;
