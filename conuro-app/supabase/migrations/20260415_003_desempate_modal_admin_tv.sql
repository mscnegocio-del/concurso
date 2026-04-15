-- Agrega soporte para modal de desempate controlado desde admin → TV pública via Realtime

-- 1. Columna desempate_activo en resultados_publicados (null = modal oculto, JSON = modal visible)
alter table public.resultados_publicados
  add column if not exists desempate_activo jsonb default null;

comment on column public.resultados_publicados.desempate_activo is
  'JSON con {puesto, criterioDesempate, participante1, participante2} cuando modal está visible en TV. Null cuando está oculto.';

-- 2. RPC para que admin active/desactive el modal de desempate en la TV
create or replace function public.coordinador_toggle_desempate(
  p_evento_id    uuid,
  p_categoria_id uuid,
  p_payload      jsonb  -- null = ocultar, objeto con DesempateInfo = mostrar
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verificar que la categoría está ya publicada
  if not exists (
    select 1 from public.resultados_publicados
    where evento_id = p_evento_id and categoria_id = p_categoria_id
  ) then
    raise exception 'La categoría no está publicada aún';
  end if;

  -- UPDATE dispara Realtime que la TV ya escucha
  update public.resultados_publicados
    set desempate_activo = p_payload
    where evento_id = p_evento_id and categoria_id = p_categoria_id;
end;
$$;

revoke all on function public.coordinador_toggle_desempate(uuid, uuid, jsonb) from public;
grant execute on function public.coordinador_toggle_desempate(uuid, uuid, jsonb) to authenticated;

-- 3. Actualizar RPC pública para exponer desempate_activo
drop function if exists public.publico_categorias_publicadas(text);

create or replace function public.publico_categorias_publicadas(p_codigo text)
returns table (
  categoria_id    uuid,
  publicado_at    timestamptz,
  paso_revelacion int,
  desempate_activo jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rp.categoria_id,
    rp.publicado_at,
    rp.paso_revelacion,
    rp.desempate_activo
  from public.resultados_publicados rp
  join public.eventos e on e.id = rp.evento_id
  where lower(trim(e.codigo_acceso)) = lower(trim(p_codigo))
    and e.estado <> 'borrador'
  order by rp.publicado_at desc;
$$;

revoke all on function public.publico_categorias_publicadas(text) from public;
grant execute on function public.publico_categorias_publicadas(text) to anon, authenticated;
