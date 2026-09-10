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

-- Políticas públicas de leitura
CREATE POLICY "Leitura pública de bilhetes" ON bilhetes FOR SELECT USING (true);
CREATE POLICY "Leitura pública de config" ON config FOR SELECT USING (true);

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

-- =====================================================
-- TABELA: produtos (para a página Merch)
-- =====================================================
CREATE TABLE IF NOT EXISTS produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cat TEXT DEFAULT '',
  descricao TEXT NOT NULL,
  preco NUMERIC(10,2) DEFAULT 0,
  emoji TEXT DEFAULT '📦',
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
  ('CAMISETA OFICIAL', 'Vestuário', '100% algodão, estampa serigrafia com o logo da banda.', 0, '👕', 'Novo', ARRAY['P','M','G','GG'], true, 1),
  ('PALHETA EXCLUSIVA', 'Acessórios', 'Palheta personalizada com o logo da Nexus. Pack com 3 unidades.', 0, '🎸', NULL, '{}', true, 2),
  ('CHAVEIRO NEXUS', 'Acessórios', 'Chaveiro metálico com o símbolo da Nexus. Acabamento premium.', 0, '🔑', NULL, '{}', true, 3),
  ('PIN COLECIONÁVEL', 'Acessórios', 'Pin esmaltado com o logo da Nexus. Ideal para jaquetas e mochilas.', 0, '📌', NULL, '{}', true, 4),
  ('PACK ADESIVOS', 'Colecionáveis', '6 adesivos em vinil impermeável com artes exclusivas da banda.', 0, '🎨', NULL, '{}', true, 5),
  ('BAQUETAS ASSINADAS', 'Colecionáveis', 'Baquetas autografadas pelo baterista. Edição limitada e numerada.', 0, '🥁', 'Em breve', '{}', false, 6)
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
  ('DAVI', 'Guitarra & Vocal', '/imgs/membro-davi.jpeg', '', '', '', true, 1),
  ('JOÃO', 'Guitarra', '/imgs/membro-joao.jpeg', '', '', '', true, 2),
  ('ATILA', 'Teclados', '/imgs/membro-atila.jpeg', '', '', '', true, 3),
  ('VICTOR', 'Bateria', '/imgs/membro-victor.jpeg', '', '', '', true, 4),
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

