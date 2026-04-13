-- Si puestos_a_premiar viniera null/0, v_lim hacía que <= comparara contra NULL y no devolvía filas.
create or replace function public.publico_podio_categoria(p_codigo text, p_categoria_id uuid)
returns table (
  puesto int,
  participante_id uuid,
  codigo text,
  nombre_completo text,
  puntaje_final numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
  v_lim int;
begin
  select e.id, e.puestos_a_premiar into v_evento_id, v_lim
  from public.eventos e
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  limit 1;

  if v_evento_id is null then
    return;
  end if;

  v_lim := case coalesce(v_lim, 0) when 2 then 2 else 3 end;

  if not exists (
    select 1
    from public.categorias c
    where c.id = p_categoria_id
      and c.evento_id = v_evento_id
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.resultados_publicados rp
    where rp.evento_id = v_evento_id
      and rp.categoria_id = p_categoria_id
  ) then
    return;
  end if;

  return query
  select
    (ranked.puesto)::integer as puesto,
    ranked.participante_id,
    ranked.codigo,
    ranked.nombre_completo,
    ranked.puntaje_final
  from (
    select
      row_number() over (order by pf.puntaje_final desc, pf.nombre_completo asc) as puesto,
      pf.participante_id,
      pf.codigo,
      pf.nombre_completo,
      pf.puntaje_final
    from public._puntajes_finales_categoria(p_categoria_id) pf
  ) ranked
  where ranked.puesto <= v_lim
  order by ranked.puesto;
end;
$$;
