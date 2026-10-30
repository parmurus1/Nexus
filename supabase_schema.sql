-- Execute este SQL no painel do Supabase (SQL Editor)

-- Tabela de bilhetes
CREATE TABLE bilhetes (
  id SERIAL PRIMARY KEY,
  numero INTEGER UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'disponivel', -- 'disponivel' | 'reservado' | 'pago'
  nome_comprador TEXT,
  email_comprador TEXT,
  telefone_comprador TEXT,
  payment_id TEXT,
  preference_id TEXT,
  reservado_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de configurações da rifa
CREATE TABLE config (
  id SERIAL PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  valor TEXT NOT NULL
);

-- Tabela de sorteio
CREATE TABLE sorteio (
  id SERIAL PRIMARY KEY,
  numero_sorteado INTEGER,
  nome_vencedor TEXT,
  realizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configurações padrão
INSERT INTO config (chave, valor) VALUES
  ('titulo_rifa', 'Rifa Nexus Band'),
  ('descricao_rifa', 'Apoie nossa música e concorra a prêmios exclusivos!'),
  ('valor_bilhete', '10.00'),
  ('data_sorteio', '2025-05-31'),
  ('total_bilhetes', '100'),
  ('rifa_ativa', 'true'),
  ('chave_pix', 'SEU_PIX_AQUI');

-- Inserir os 100 bilhetes
INSERT INTO bilhetes (numero)
SELECT generate_series(1, 100);

-- Habilitar RLS
ALTER TABLE bilhetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteio ENABLE ROW LEVEL SECURITY;

-- Sem leitura pública: bilhetes (dados dos compradores) e config (chave Pix)
-- são lidos só pelo servidor, com a service_role.

-- Políticas de escrita apenas via service_role (backend)
CREATE POLICY "Escrita via service_role em bilhetes" ON bilhetes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Escrita via service_role em config" ON config FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Escrita via service_role em sorteio" ON sorteio FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- MIGRAÇÃO: adicionar coluna instagram_comprador
-- Execute este bloco se o banco já estiver criado
-- =====================================================
ALTER TABLE bilhetes ADD COLUMN IF NOT EXISTS instagram_comprador TEXT;

-- Também adicionar coluna instagram_vencedor na tabela de sorteio
ALTER TABLE sorteio ADD COLUMN IF NOT EXISTS instagram_vencedor TEXT;

-- =====================================================
-- TABELA: shows (para a página Agenda)
-- =====================================================
CREATE TABLE IF NOT EXISTS shows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  data DATE NOT NULL,
  hora TEXT,
  local TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'breve', -- 'breve' | 'confirmado' | 'realizado' | 'cancelado'
  link TEXT,
  gratuito BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública de shows" ON shows FOR SELECT USING (true);
CREATE POLICY "Escrita via service_role em shows" ON shows FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- MIGRAÇÃO: adicionar coluna gratuito na tabela shows
-- Execute este bloco se a tabela shows já estiver criada
-- =====================================================
ALTER TABLE shows ADD COLUMN IF NOT EXISTS gratuito BOOLEAN DEFAULT false;

-- MIGRAÇÃO: ordem manual dos shows (arrastar no painel admin)
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ordem INTEGER;

-- =====================================================
-- TABELA: produtos (para a página Merch)
-- =====================================================
CREATE TABLE IF NOT EXISTS produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cat TEXT DEFAULT '',
  descricao TEXT NOT NULL,
  preco NUMERIC(10,2) DEFAULT 0,
  emoji TEXT DEFAULT 'package', -- nome do ícone exibido quando o produto não tem foto (shirt, guitar, key, pin, sticker, drum, music, package)
  img TEXT DEFAULT '',
  badge TEXT,
  sizes TEXT[] DEFAULT '{}',
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  -- Dados usados no cálculo de frete via Melhor Envio (peso em kg, dimensões em cm)
  peso_kg NUMERIC(6,3) DEFAULT 0.3,
  altura_cm NUMERIC(6,2) DEFAULT 5,
  largura_cm NUMERIC(6,2) DEFAULT 20,
  comprimento_cm NUMERIC(6,2) DEFAULT 25,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MIGRAÇÃO: se a tabela "produtos" já existir sem essas colunas, rode:
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(6,3) DEFAULT 0.3;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS altura_cm NUMERIC(6,2) DEFAULT 5;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS largura_cm NUMERIC(6,2) DEFAULT 20;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS comprimento_cm NUMERIC(6,2) DEFAULT 25;

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública de produtos" ON produtos FOR SELECT USING (true);
CREATE POLICY "Escrita via service_role em produtos" ON produtos FOR ALL USING (auth.role() = 'service_role');

-- Dados iniciais de exemplo (remova se preferir começar vazio)
INSERT INTO produtos (nome, cat, descricao, preco, emoji, badge, sizes, ativo, ordem) VALUES
  ('CAMISETA OFICIAL', 'Vestuário', '100% algodão, estampa serigrafia com o logo da banda.', 0, 'shirt', 'Novo', ARRAY['P','M','G','GG'], true, 1),
  ('PALHETA EXCLUSIVA', 'Acessórios', 'Palheta personalizada com o logo da Nexus. Pack com 3 unidades.', 0, 'guitar', NULL, '{}', true, 2),
  ('CHAVEIRO NEXUS', 'Acessórios', 'Chaveiro metálico com o símbolo da Nexus. Acabamento premium.', 0, 'key', NULL, '{}', true, 3),
  ('PIN COLECIONÁVEL', 'Acessórios', 'Pin esmaltado com o logo da Nexus. Ideal para jaquetas e mochilas.', 0, 'pin', NULL, '{}', true, 4),
  ('PACK ADESIVOS', 'Colecionáveis', '6 adesivos em vinil impermeável com artes exclusivas da banda.', 0, 'sticker', NULL, '{}', true, 5),
  ('BAQUETAS ASSINADAS', 'Colecionáveis', 'Baquetas autografadas pelo baterista. Edição limitada e numerada.', 0, 'drum', 'Em breve', '{}', false, 6)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TABELA: membros (para a página Sobre / painel de membro)
-- Execute este bloco no SQL Editor do Supabase para habilitar
-- a edição dos membros pelo painel admin.
-- =====================================================
CREATE TABLE IF NOT EXISTS membros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  funcao TEXT DEFAULT '',
  foto TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  tiktok TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE membros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública de membros" ON membros FOR SELECT USING (true);
CREATE POLICY "Escrita via service_role em membros" ON membros FOR ALL USING (auth.role() = 'service_role');

-- Dados iniciais: os membros que já existiam no site (fixos no HTML) + 1 novo, para
-- você preencher com foto/bio/instagram reais direto pelo painel admin.
INSERT INTO membros (nome, funcao, foto, bio, instagram, tiktok, ativo, ordem) VALUES
  ('DAVI', 'Guitarra & Vocal', '/imgs/banda/membro-davi.jpeg', '', '', '', true, 1),
  ('JOÃO', 'Guitarra', '/imgs/banda/membro-joao.jpeg', '', '', '', true, 2),
  ('ATILA', 'Teclados', '/imgs/banda/membro-atila.jpeg', '', '', '', true, 3),
  ('VICTOR', 'Bateria', '/imgs/banda/membro-victor.jpeg', '', '', '', true, 4),
  ('NOVO MEMBRO', 'Instrumento', '', 'Edite este card pelo painel admin: adicione foto, função e uma breve bio.', '', '', true, 5)
ON CONFLICT DO NOTHING;

-- =====================================================
-- STORAGE: bucket para upload das fotos dos membros
-- Execute este bloco no SQL Editor do Supabase para habilitar
-- o upload de fotos direto pelo painel admin (aba Membros).
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('membros-fotos', 'membros-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública das fotos (necessário para elas aparecerem no site)
CREATE POLICY "Leitura pública fotos membros"
ON storage.objects FOR SELECT
USING (bucket_id = 'membros-fotos');

-- Upload/edição/exclusão apenas via service_role (usado pela API do admin,
-- protegida pela senha em ADMIN_PASSWORD)
CREATE POLICY "Service role gerencia fotos membros"
ON storage.objects FOR ALL
USING (bucket_id = 'membros-fotos' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'membros-fotos' AND auth.role() = 'service_role');

-- =====================================================
-- TABELA: pedidos_merch (checkout da loja via Mercado Pago)
-- Execute este bloco no SQL Editor do Supabase para habilitar
-- o pagamento via Pix na aba Merch.
-- =====================================================
CREATE TABLE IF NOT EXISTS pedidos_merch (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  itens JSONB NOT NULL,               -- [{nome, tam, qty, preco}]
  valor_total NUMERIC NOT NULL,
  nome_comprador TEXT NOT NULL,
  email_comprador TEXT NOT NULL,
  telefone_comprador TEXT,
  instagram_comprador TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'pago' | 'cancelado'
  preference_id TEXT,
  payment_id TEXT,
  -- Endereço de entrega e frete calculado via Melhor Envio
  cep TEXT,
  uf TEXT,
  cidade TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  frete_servico TEXT,   -- ex: "PAC", "SEDEX"
  frete_transportadora TEXT, -- ex: "Correios"
  frete_prazo_dias INTEGER,
  frete_valor NUMERIC(10,2) DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  pago_em TIMESTAMPTZ
);

-- MIGRAÇÃO: se a tabela "pedidos_merch" já existir sem essas colunas, rode:
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS frete_servico TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS frete_transportadora TEXT;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS frete_prazo_dias INTEGER;
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS frete_valor NUMERIC(10,2) DEFAULT 0;

-- Etiqueta gerada automaticamente no Melhor Envio após o pagamento aprovado (via webhook)
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS frete_service_id TEXT; -- id da opção de frete escolhida (necessário para o carrinho do Melhor Envio)
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS me_etiqueta_id TEXT;   -- id da etiqueta/pedido no Melhor Envio
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS me_rastreio TEXT;      -- código de rastreio da transportadora
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS me_link_etiqueta TEXT; -- URL do PDF da etiqueta para impressão
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS me_status TEXT DEFAULT 'nao_gerada'; -- 'nao_gerada' | 'gerada' | 'falha_saldo' | 'falha'
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS me_erro TEXT;          -- mensagem de erro, se a geração falhar
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS me_etiqueta_gerada_em TIMESTAMPTZ;

ALTER TABLE pedidos_merch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Escrita via service_role em pedidos_merch" ON pedidos_merch FOR ALL USING (auth.role() = 'service_role');
-- Sem policy de SELECT pública: pedidos só são lidos pelo backend/admin (service_role).

-- =====================================================
-- MIGRAÇÃO: produtos antigos cadastrados com emoji passam a usar ícones.
-- (O site já converte emojis antigos automaticamente; isto só limpa o banco.)
-- =====================================================
UPDATE produtos SET emoji = CASE emoji
  WHEN '👕' THEN 'shirt' WHEN '🎸' THEN 'guitar' WHEN '🔑' THEN 'key'
  WHEN '📌' THEN 'pin'   WHEN '🎨' THEN 'sticker' WHEN '🥁' THEN 'drum'
  WHEN '🎵' THEN 'music' WHEN '🎤' THEN 'mic'     ELSE 'package' END
WHERE emoji IS NULL OR emoji !~ '^[a-z-]+$';
ALTER TABLE produtos ALTER COLUMN emoji SET DEFAULT 'package';

-- =====================================================
-- GALERIA (página /galeria e prévia na /sobre)
-- Execute este bloco inteiro no SQL Editor do Supabase. Pode rodar de novo
-- sem problemas (é idempotente).
--
-- Leve para o banco: cada linha guarda só texto curto (tipo, título, URL).
-- As fotos ficam no Storage (bucket "galeria-fotos", já otimizadas em WebP
-- pelo painel) e os vídeos ficam no YouTube — a capa vem do próprio YouTube.
-- =====================================================
CREATE TABLE IF NOT EXISTS galeria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('foto', 'video')),
  titulo TEXT DEFAULT '',
  descricao TEXT DEFAULT '',          -- legenda curta (ex.: "Senac Nações Unidas · 26.03.2026")
  url TEXT NOT NULL,                  -- foto: URL da imagem grande | vídeo: link do YouTube
  thumbnail_url TEXT DEFAULT '',      -- foto: miniatura leve usada na grade
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE galeria ADD COLUMN IF NOT EXISTS descricao TEXT DEFAULT '';

-- Índice para a consulta pública (ativos, em ordem)
CREATE INDEX IF NOT EXISTS galeria_ativo_ordem_idx ON galeria (ativo, ordem);

ALTER TABLE galeria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública da galeria" ON galeria;
CREATE POLICY "Leitura pública da galeria" ON galeria FOR SELECT USING (ativo = true);
DROP POLICY IF EXISTS "Escrita via service_role na galeria" ON galeria;
CREATE POLICY "Escrita via service_role na galeria" ON galeria FOR ALL USING (auth.role() = 'service_role');

-- Reordenação em um único UPDATE (em vez de uma query por item)
CREATE OR REPLACE FUNCTION galeria_reordenar(ids UUID[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE galeria g SET ordem = t.pos
  FROM unnest(ids) WITH ORDINALITY AS t(id, pos)
  WHERE g.id = t.id;
$$;
REVOKE ALL ON FUNCTION galeria_reordenar(UUID[]) FROM PUBLIC, anon, authenticated;

-- Conteúdo inicial: as fotos e vídeos que antes estavam fixos na página Sobre.
-- Só insere se a galeria estiver vazia.
INSERT INTO galeria (tipo, titulo, descricao, url, thumbnail_url, ordem)
SELECT * FROM (VALUES
  ('foto',  'Ao vivo', '', '/imgs/shows/show-03.jpeg', '/imgs/shows/thumb/show-03.webp', 1),
  ('foto',  'Ao vivo', '', '/imgs/shows/show-04.jpeg', '/imgs/shows/thumb/show-04.webp', 2),
  ('foto',  'Ao vivo', '', '/imgs/shows/show-01.jpeg', '/imgs/shows/thumb/show-01.webp', 3),
  ('foto',  'Ao vivo', '', '/imgs/shows/show-02.jpeg', '/imgs/shows/thumb/show-02.webp', 4),
  ('foto',  'Ao vivo', '', '/imgs/shows/show-05.jpeg', '/imgs/shows/thumb/show-05.webp', 5),
  ('video', 'Solo de bateria', 'Senac Nações Unidas · 26.03.2026', 'https://www.youtube.com/shorts/JECQqubB5Dc', '', 6),
  ('video', 'Bodies',          'Senac Nações Unidas · 26.03.2026', 'https://www.youtube.com/shorts/_ElioiT5R8Q', '', 7),
  ('video', 'Debil Metal',     'Senac Nações Unidas · 30.10.2025', 'https://www.youtube.com/shorts/93pcz_6b-JM', '', 8),
  ('video', 'Toxicity',        'Senac Nações Unidas · 26.03.2026', 'https://www.youtube.com/shorts/o3ycjRGmkhc', '', 9)
) AS v(tipo, titulo, descricao, url, thumbnail_url, ordem)
WHERE NOT EXISTS (SELECT 1 FROM galeria);

-- =====================================================
-- STORAGE: buckets das fotos da galeria e dos produtos
-- Limite de 3MB por arquivo e só imagens — o próprio Supabase recusa o resto.
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('galeria-fotos',  'galeria-fotos',  true, 3145728, ARRAY['image/webp','image/jpeg','image/png','image/gif']),
  ('produtos-fotos', 'produtos-fotos', true, 3145728, ARRAY['image/webp','image/jpeg','image/png','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Leitura pública fotos galeria e produtos" ON storage.objects;
CREATE POLICY "Leitura pública fotos galeria e produtos"
ON storage.objects FOR SELECT
USING (bucket_id IN ('galeria-fotos', 'produtos-fotos'));

DROP POLICY IF EXISTS "Service role gerencia fotos galeria e produtos" ON storage.objects;
CREATE POLICY "Service role gerencia fotos galeria e produtos"
ON storage.objects FOR ALL
USING (bucket_id IN ('galeria-fotos', 'produtos-fotos') AND auth.role() = 'service_role')
WITH CHECK (bucket_id IN ('galeria-fotos', 'produtos-fotos') AND auth.role() = 'service_role');

-- =====================================================
-- ATUALIZAÇÃO 2 — estoque, orçamentos, login seguro do admin
-- Execute este bloco inteiro no SQL Editor do Supabase (pode rodar de novo).
-- =====================================================

-- Estoque opcional por tamanho na loja: {"P": 3, "M": 5} ou {"único": 10}.
-- NULL = sem controle de estoque (comportamento antigo).
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque JSONB;

-- Baixa o estoque quando um pedido é pago (chamado pelo webhook)
CREATE OR REPLACE FUNCTION baixar_estoque(p_id UUID, p_tam TEXT, p_qtd INT)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE produtos
  SET estoque = jsonb_set(estoque, ARRAY[p_tam], to_jsonb(GREATEST(0, COALESCE((estoque->>p_tam)::int, 0) - p_qtd)))
  WHERE id = p_id AND estoque IS NOT NULL AND estoque ? p_tam;
$$;
REVOKE ALL ON FUNCTION baixar_estoque(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;

-- Pedidos de orçamento enviados pela página Contratantes
CREATE TABLE IF NOT EXISTS orcamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  data_evento DATE,
  cidade TEXT,
  tipo_evento TEXT,
  mensagem TEXT,
  status TEXT NOT NULL DEFAULT 'novo', -- 'novo' | 'respondido' | 'fechado' | 'arquivado'
  ip TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orcamentos_ip_idx ON orcamentos (ip, criado_em);
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role gerencia orcamentos" ON orcamentos;
CREATE POLICY "Service role gerencia orcamentos" ON orcamentos FOR ALL USING (auth.role() = 'service_role');

-- Tentativas de login erradas no painel (limite de 5 a cada 15 min por IP)
CREATE TABLE IF NOT EXISTS admin_tentativas (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_tentativas_ip_idx ON admin_tentativas (ip, criado_em);
ALTER TABLE admin_tentativas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role gerencia tentativas" ON admin_tentativas;
CREATE POLICY "Service role gerencia tentativas" ON admin_tentativas FOR ALL USING (auth.role() = 'service_role');

-- Pedro (baixo) aparece na biografia mas não estava entre os membros.
-- Depois, adicione a foto e a bio dele pelo painel (Membros).
INSERT INTO membros (nome, funcao, foto, bio, ativo, ordem)
SELECT 'PEDRO', 'Baixo', '', '', true, 5
WHERE NOT EXISTS (SELECT 1 FROM membros WHERE upper(nome) = 'PEDRO');

-- =====================================================
-- OPCIONAL — liberação automática de bilhetes a cada 2 minutos (pg_cron)
-- O site já libera reservas vencidas sozinho sempre que alguém abre a rifa
-- ou tenta comprar; isto só garante a limpeza mesmo sem visitas.
-- Se der erro de permissão, ative "pg_cron" em Database > Extensions e rode de novo.
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'liberar-bilhetes-expirados',
  '*/2 * * * *',
  $$UPDATE bilhetes
    SET status = 'disponivel', nome_comprador = NULL, email_comprador = NULL, instagram_comprador = NULL,
        telefone_comprador = NULL, preference_id = NULL, reservado_em = NULL
    WHERE status = 'reservado' AND reservado_em < NOW() - INTERVAL '10 minutes'$$
);
-- Limpa tentativas de login antigas uma vez por dia
SELECT cron.schedule('limpar-tentativas-admin', '0 4 * * *', $$DELETE FROM admin_tentativas WHERE criado_em < NOW() - INTERVAL '1 day'$$);

-- =====================================================
-- ATUALIZAÇÃO 3 — cartaz dos shows e lista de fãs
-- Execute este bloco no SQL Editor do Supabase (pode rodar de novo).
-- =====================================================

-- Cartaz (flyer) opcional de cada show, exibido na Agenda
ALTER TABLE shows ADD COLUMN IF NOT EXISTS cartaz TEXT;

-- Fãs que pediram aviso de shows no rodapé do site (e-mail ou WhatsApp)
CREATE TABLE IF NOT EXISTS fas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contato TEXT NOT NULL UNIQUE,   -- e-mail em minúsculas ou WhatsApp só com números (DDD + número)
  tipo TEXT NOT NULL,             -- 'email' | 'whatsapp'
  origem TEXT,                    -- página onde se cadastrou
  ip TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fas_ip_idx ON fas (ip, criado_em);
ALTER TABLE fas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role gerencia fas" ON fas;
CREATE POLICY "Service role gerencia fas" ON fas FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- ATUALIZAÇÃO 4 — shows vindos do app da banda
-- Execute este bloco no SQL Editor do Supabase (pode rodar de novo).
-- =====================================================

-- Id do show no app da banda: o app pode reenviar o mesmo show para atualizar
-- (data, local, cancelamento) sem criar duplicado na agenda.
ALTER TABLE shows ADD COLUMN IF NOT EXISTS externo_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS shows_externo_id_idx ON shows (externo_id);

-- =====================================================
-- ATUALIZAÇÃO 5 — rifa: pagamentos em conflito e fim das vendas
-- Execute este bloco no SQL Editor do Supabase (pode rodar de novo).
-- =====================================================

-- Pagamentos aprovados depois que a reserva venceu e o número já era de outra
-- pessoa. Aparecem no admin (Rifa → Bilhetes) para a banda devolver o valor
-- ou combinar outros números.
CREATE TABLE IF NOT EXISTS rifa_conflitos (
  id SERIAL PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  nome TEXT,
  email TEXT,
  instagram TEXT,
  telefone TEXT,
  numeros_pedidos INTEGER[],
  numeros_faltando INTEGER[],
  valor NUMERIC(10,2),
  resolvido BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rifa_conflitos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role gerencia conflitos" ON rifa_conflitos;
CREATE POLICY "Service role gerencia conflitos" ON rifa_conflitos FOR ALL USING (auth.role() = 'service_role');

-- Privacidade (LGPD): o site lê bilhetes e config só pelo servidor (service_role).
-- A leitura pública direta pelo Supabase expunha nome, e-mail e telefone de quem
-- comprou para qualquer pessoa com a chave anon do projeto.
DROP POLICY IF EXISTS "Leitura pública de bilhetes" ON bilhetes;
DROP POLICY IF EXISTS "Leitura pública de config" ON config;

-- IP de quem reservou: limita quantos números uma mesma pessoa segura sem pagar
ALTER TABLE bilhetes ADD COLUMN IF NOT EXISTS ip_reserva TEXT;
CREATE INDEX IF NOT EXISTS bilhetes_ip_reserva_idx ON bilhetes (ip_reserva) WHERE status = 'reservado';

-- Consulta de status do pagamento pela página de sucesso
CREATE INDEX IF NOT EXISTS bilhetes_payment_id_idx ON bilhetes (payment_id);
CREATE INDEX IF NOT EXISTS bilhetes_preference_id_idx ON bilhetes (preference_id);

-- "Vendas abertas" (o sorteio desliga sozinho)
INSERT INTO config (chave, valor) VALUES ('rifa_ativa', 'true') ON CONFLICT (chave) DO NOTHING;

-- CPF do comprador da loja (exigido na etiqueta). O código já gravava esta
-- coluna, mas ela não estava no schema.
ALTER TABLE pedidos_merch ADD COLUMN IF NOT EXISTS cpf_comprador TEXT;

-- Guarda de dados (LGPD): limpeza automática uma vez por dia.
-- Os prazos estão também na página /privacidade — mude os dois juntos.
CREATE OR REPLACE FUNCTION limpar_dados_antigos() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  data_sorteio DATE;
BEGIN
  SELECT CASE WHEN valor ~ '^\d{4}-\d{2}-\d{2}$' THEN valor::date END INTO data_sorteio
  FROM config WHERE chave = 'data_sorteio';

  -- Rifa: 6 meses depois do sorteio, os bilhetes ficam sem dados de quem comprou
  IF data_sorteio IS NOT NULL AND CURRENT_DATE > data_sorteio + INTERVAL '6 months' THEN
    UPDATE bilhetes SET nome_comprador = NULL, email_comprador = NULL, instagram_comprador = NULL,
                        telefone_comprador = NULL, ip_reserva = NULL
    WHERE status = 'pago' AND pago_em < NOW() - INTERVAL '6 months'
      AND (nome_comprador IS NOT NULL OR email_comprador IS NOT NULL);
  END IF;
  UPDATE sorteio SET nome_vencedor = NULL, instagram_vencedor = NULL
  WHERE realizado_em < NOW() - INTERVAL '6 months' AND (nome_vencedor IS NOT NULL OR instagram_vencedor IS NOT NULL);
  DELETE FROM rifa_conflitos WHERE resolvido AND criado_em < NOW() - INTERVAL '6 months';

  -- IP de quem reservou: até 30 dias
  UPDATE bilhetes SET ip_reserva = NULL
  WHERE ip_reserva IS NOT NULL AND (reservado_em IS NULL OR reservado_em < NOW() - INTERVAL '30 days');

  -- Loja: pedidos nunca pagos somem em 6 meses; nos pagos, endereço e telefone
  -- saem em 6 meses e nome, e-mail e CPF em 5 anos (prazo do CDC, art. 27)
  DELETE FROM pedidos_merch WHERE status <> 'pago' AND criado_em < NOW() - INTERVAL '6 months';
  UPDATE pedidos_merch SET endereco = NULL, numero = NULL, complemento = NULL, bairro = NULL,
                           cep = NULL, telefone_comprador = NULL
  WHERE criado_em < NOW() - INTERVAL '6 months' AND (endereco IS NOT NULL OR telefone_comprador IS NOT NULL);
  UPDATE pedidos_merch SET nome_comprador = '(apagado)', email_comprador = '(apagado)', cpf_comprador = NULL
  WHERE criado_em < NOW() - INTERVAL '5 years' AND email_comprador <> '(apagado)';

  -- Orçamentos: 2 anos
  DELETE FROM orcamentos WHERE criado_em < NOW() - INTERVAL '2 years';
END;
$$;

-- Agenda a limpeza todo dia às 5h (UTC). Precisa da extensão pg_cron
-- (Database > Extensions); sem ela, só esta linha dá erro e o resto já foi aplicado.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('limpar-dados-antigos', '0 5 * * *', $$SELECT limpar_dados_antigos()$$);

-- =====================================================
-- ATUALIZAÇÃO 6 — rifa: "Meus números" com código por e-mail
-- Execute este bloco no SQL Editor do Supabase (pode rodar de novo).
-- =====================================================

-- Códigos de verificação de 6 dígitos (guardados só como hash). Valem 10 minutos,
-- aceitam 5 tentativas e são apagados depois de 1 dia.
CREATE TABLE IF NOT EXISTS rifa_codigos (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  codigo_hash TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  usado BOOLEAN NOT NULL DEFAULT false,
  ip TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rifa_codigos_email_idx ON rifa_codigos (email, criado_em);
CREATE INDEX IF NOT EXISTS rifa_codigos_ip_idx ON rifa_codigos (ip, criado_em);
CREATE INDEX IF NOT EXISTS bilhetes_email_idx ON bilhetes (email_comprador);
ALTER TABLE rifa_codigos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role gerencia codigos" ON rifa_codigos;
CREATE POLICY "Service role gerencia codigos" ON rifa_codigos FOR ALL USING (auth.role() = 'service_role');

SELECT cron.schedule('limpar-codigos-rifa', '15 * * * *', $$DELETE FROM rifa_codigos WHERE criado_em < NOW() - INTERVAL '1 day'$$);
