-- Extensiones
create extension if not exists pgcrypto;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'rol_usuario') then
    create type public.rol_usuario as enum ('super_admin', 'admin', 'administrador');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_evento') then
    create type public.estado_evento as enum ('borrador', 'abierto', 'calificando', 'cerrado', 'publicado');
  end if;
end $$;

-- Tablas
create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  logo_url text,
  logo_subsede_url text,
  plan text not null default 'gratuito',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  email text not null unique,
  rol public.rol_usuario not null,
  nombre_completo text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.plantillas_criterios (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  nombre_plantilla text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.plantilla_criterios_items (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.plantillas_criterios(id) on delete cascade,
  nombre text not null,
  puntaje_maximo numeric(6,2) not null check (puntaje_maximo >= 0),
  orden int not null check (orden > 0),
  es_criterio_desempate boolean not null default false
);

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  nombre text not null,
  descripcion text,
  fecha date not null,
  estado public.estado_evento not null default 'borrador',
  codigo_acceso varchar(6) not null unique,
  puestos_a_premiar int not null check (puestos_a_premiar in (2, 3)),
  plantilla_criterios_id uuid references public.plantillas_criterios(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.criterios (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nombre text not null,
  puntaje_maximo numeric(6,2) not null check (puntaje_maximo >= 0),
  orden int not null check (orden > 0),
  es_criterio_desempate boolean not null default false
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nombre text not null,
  orden int not null check (orden > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.participantes (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  nombre_completo text not null,
  codigo varchar(10) not null,
  created_at timestamptz not null default now(),
  unique (categoria_id, codigo)
);

create table if not exists public.jurados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nombre_completo text not null,
  orden int not null check (orden > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.calificaciones (
  id uuid primary key default gen_random_uuid(),
  jurado_id uuid not null references public.jurados(id) on delete cascade,
  participante_id uuid not null references public.participantes(id) on delete cascade,
  criterio_id uuid not null references public.criterios(id) on delete cascade,
  puntaje numeric(6,2) not null check (puntaje >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jurado_id, participante_id, criterio_id)
);

create table if not exists public.resultados_publicados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  publicado_por uuid references public.usuarios(id) on delete set null,
  publicado_at timestamptz not null default now(),
  unique (evento_id, categoria_id)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  jurado_id uuid references public.jurados(id) on delete set null,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Índices y unicidad de evento activo
create unique index if not exists ux_evento_activo_por_organizacion
  on public.eventos(organizacion_id)
  where estado in ('abierto', 'calificando');

create index if not exists ix_eventos_org on public.eventos(organizacion_id);
create index if not exists ix_categorias_evento on public.categorias(evento_id);
create index if not exists ix_participantes_categoria on public.participantes(categoria_id);
create index if not exists ix_jurados_evento on public.jurados(evento_id);
create index if not exists ix_criterios_evento on public.criterios(evento_id);

-- Funciones auxiliares de contexto
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
as $$
  select u.organizacion_id
  from public.usuarios u
  where u.id = auth.uid()
$$;

create or replace function public.current_user_role()
returns public.rol_usuario
language sql
stable
as $$
  select u.rol
  from public.usuarios u
  where u.id = auth.uid()
$$;

-- Trigger para updated_at en calificaciones
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_calificaciones_updated_at on public.calificaciones;
create trigger trg_calificaciones_updated_at
before update on public.calificaciones
for each row
execute function public.set_updated_at();

-- Trigger para validar puntaje <= puntaje_maximo del criterio
create or replace function public.validar_puntaje_calificacion()
returns trigger
language plpgsql
as $$
declare
  v_max numeric(6,2);
begin
  select c.puntaje_maximo into v_max
  from public.criterios c
  where c.id = new.criterio_id;

  if v_max is null then
    raise exception 'Criterio no encontrado para calificacion';
  end if;

  if new.puntaje > v_max then
    raise exception 'Puntaje (%) excede puntaje maximo (%)', new.puntaje, v_max;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_puntaje_calificacion on public.calificaciones;
create trigger trg_validar_puntaje_calificacion
before insert or update on public.calificaciones
for each row
execute function public.validar_puntaje_calificacion();

-- RLS
alter table public.organizaciones enable row level security;
alter table public.usuarios enable row level security;
alter table public.plantillas_criterios enable row level security;
alter table public.plantilla_criterios_items enable row level security;
alter table public.eventos enable row level security;
alter table public.criterios enable row level security;
alter table public.categorias enable row level security;
alter table public.participantes enable row level security;
alter table public.jurados enable row level security;
alter table public.calificaciones enable row level security;
alter table public.resultados_publicados enable row level security;
alter table public.audit_log enable row level security;

-- Organizaciones
drop policy if exists org_select on public.organizaciones;
create policy org_select on public.organizaciones
for select to authenticated
using (
  id = public.current_user_org_id()
  or public.current_user_role() = 'super_admin'
);

-- Usuarios
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
for select to authenticated
using (
  organizacion_id = public.current_user_org_id()
  or public.current_user_role() = 'super_admin'
);

drop policy if exists usuarios_write_admin on public.usuarios;
create policy usuarios_write_admin on public.usuarios
for all to authenticated
using (
  public.current_user_role() in ('admin', 'super_admin')
  and (
    organizacion_id = public.current_user_org_id()
    or public.current_user_role() = 'super_admin'
  )
)
with check (
  public.current_user_role() in ('admin', 'super_admin')
  and (
    organizacion_id = public.current_user_org_id()
    or public.current_user_role() = 'super_admin'
  )
);

-- Políticas generales por organización para tablas de evento
drop policy if exists eventos_org_access on public.eventos;
create policy eventos_org_access on public.eventos
for all to authenticated
using (
  organizacion_id = public.current_user_org_id()
  or public.current_user_role() = 'super_admin'
)
with check (
  organizacion_id = public.current_user_org_id()
  or public.current_user_role() = 'super_admin'
);

drop policy if exists plantillas_org_access on public.plantillas_criterios;
create policy plantillas_org_access on public.plantillas_criterios
for all to authenticated
using (
  organizacion_id = public.current_user_org_id()
  or public.current_user_role() = 'super_admin'
)
with check (
  organizacion_id = public.current_user_org_id()
  or public.current_user_role() = 'super_admin'
);

drop policy if exists plantilla_items_access on public.plantilla_criterios_items;
create policy plantilla_items_access on public.plantilla_criterios_items
for all to authenticated
using (
  exists (
    select 1
    from public.plantillas_criterios pc
    where pc.id = plantilla_id
      and (
        pc.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.plantillas_criterios pc
    where pc.id = plantilla_id
      and (
        pc.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

drop policy if exists criterios_access on public.criterios;
create policy criterios_access on public.criterios
for all to authenticated
using (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

drop policy if exists categorias_access on public.categorias;
create policy categorias_access on public.categorias
for all to authenticated
using (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

drop policy if exists participantes_access on public.participantes;
create policy participantes_access on public.participantes
for all to authenticated
using (
  exists (
    select 1
    from public.categorias c
    join public.eventos e on e.id = c.evento_id
    where c.id = categoria_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.categorias c
    join public.eventos e on e.id = c.evento_id
    where c.id = categoria_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

drop policy if exists jurados_access on public.jurados;
create policy jurados_access on public.jurados
for all to authenticated
using (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

-- Calificaciones: admin/super_admin por organización y jurado autenticado solo propias
drop policy if exists calificaciones_admin_access on public.calificaciones;
create policy calificaciones_admin_access on public.calificaciones
for all to authenticated
using (
  public.current_user_role() in ('admin', 'administrador', 'super_admin')
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
  public.current_user_role() in ('admin', 'administrador', 'super_admin')
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

-- Resultados publicados: lectura pública controlada por existencia de fila
drop policy if exists resultados_publicados_read_public on public.resultados_publicados;
create policy resultados_publicados_read_public on public.resultados_publicados
for select to anon, authenticated
using (true);

drop policy if exists resultados_publicados_write_org on public.resultados_publicados;
create policy resultados_publicados_write_org on public.resultados_publicados
for all to authenticated
using (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.eventos e
    where e.id = evento_id
      and (
        e.organizacion_id = public.current_user_org_id()
        or public.current_user_role() = 'super_admin'
      )
  )
);

-- Audit log: solo inserción autenticada dentro de su organización, lectura admin/super_admin
drop policy if exists audit_insert_org on public.audit_log;
create policy audit_insert_org on public.audit_log
for insert to authenticated
with check (
  organizacion_id = public.current_user_org_id()
  or public.current_user_role() = 'super_admin'
);

drop policy if exists audit_read_admin on public.audit_log;
create policy audit_read_admin on public.audit_log
for select to authenticated
using (
  (
    public.current_user_role() in ('admin', 'administrador')
    and organizacion_id = public.current_user_org_id()
  )
  or public.current_user_role() = 'super_admin'
);
