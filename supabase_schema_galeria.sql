-- ═══════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Galeria (fotos e vídeos)
-- Rode este bloco no SQL Editor do Supabase do projeto Nexus.
-- ═══════════════════════════════════════════════════════════════

-- Tabela principal da galeria
create table if not exists galeria (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('foto', 'video')),
  titulo text default '',
  url text not null,              -- URL da foto, ou do vídeo (YouTube/Vimeo/Instagram/TikTok/arquivo .mp4)
  thumbnail_url text default '',  -- opcional: capa customizada para vídeos
  ordem integer default 99,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create index if not exists galeria_tipo_idx on galeria(tipo);
create index if not exists galeria_ordem_idx on galeria(ordem);

-- Bucket de Storage para as fotos enviadas pelo painel admin
insert into storage.buckets (id, name, public)
values ('galeria-fotos', 'galeria-fotos', true)
on conflict (id) do nothing;

-- Permite leitura pública dos arquivos do bucket (necessário para as fotos
-- aparecerem no site) e escrita/gestão apenas por chave de serviço (o painel
-- admin já usa a service key, que ignora RLS).
create policy if not exists "Leitura pública galeria-fotos"
  on storage.objects for select
  using (bucket_id = 'galeria-fotos');
