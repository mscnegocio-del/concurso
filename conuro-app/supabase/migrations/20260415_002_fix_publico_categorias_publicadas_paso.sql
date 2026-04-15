-- Corrige RPC publico_categorias_publicadas para incluir paso_revelacion
-- La TV pública necesita saber en qué paso de revelación está cada categoría

drop function if exists public.publico_categorias_publicadas(text);

create or replace function public.publico_categorias_publicadas(p_codigo text)
returns table (
  categoria_id uuid,
  publicado_at timestamptz,
  paso_revelacion int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
begin
  select e.id into v_evento_id
  from public.eventos e
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  limit 1;

  if v_evento_id is null then
    return;
  end if;

  return query
  select rp.categoria_id, rp.publicado_at, rp.paso_revelacion
  from public.resultados_publicados rp
  where rp.evento_id = v_evento_id
  order by rp.publicado_at desc;
end;
$$;

revoke all on function public.publico_categorias_publicadas(text) from public;
grant execute on function public.publico_categorias_publicadas(text) to anon, authenticated;
