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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública de shows" ON shows FOR SELECT USING (true);
CREATE POLICY "Escrita via service_role em shows" ON shows FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- TABELA: produtos (para a página Merch)
-- =====================================================
CREATE TABLE IF NOT EXISTS produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cat TEXT DEFAULT '',
  desc TEXT NOT NULL,
  preco NUMERIC(10,2) DEFAULT 0,
  emoji TEXT DEFAULT '📦',
  img TEXT DEFAULT '',
  badge TEXT,
  sizes TEXT[] DEFAULT '{}',
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública de produtos" ON produtos FOR SELECT USING (true);
CREATE POLICY "Escrita via service_role em produtos" ON produtos FOR ALL USING (auth.role() = 'service_role');

-- Dados iniciais de exemplo (remova se preferir começar vazio)
INSERT INTO produtos (nome, cat, desc, preco, emoji, badge, sizes, ativo, ordem) VALUES
  ('CAMISETA OFICIAL', 'Vestuário', '100% algodão, estampa serigrafia com o logo da banda.', 0, '👕', 'Novo', ARRAY['P','M','G','GG'], true, 1),
  ('PALHETA EXCLUSIVA', 'Acessórios', 'Palheta personalizada com o logo da Nexus. Pack com 3 unidades.', 0, '🎸', NULL, '{}', true, 2),
  ('CHAVEIRO NEXUS', 'Acessórios', 'Chaveiro metálico com o símbolo da Nexus. Acabamento premium.', 0, '🔑', NULL, '{}', true, 3),
  ('PIN COLECIONÁVEL', 'Acessórios', 'Pin esmaltado com o logo da Nexus. Ideal para jaquetas e mochilas.', 0, '📌', NULL, '{}', true, 4),
  ('PACK ADESIVOS', 'Colecionáveis', '6 adesivos em vinil impermeável com artes exclusivas da banda.', 0, '🎨', NULL, '{}', true, 5),
  ('BAQUETAS ASSINADAS', 'Colecionáveis', 'Baquetas autografadas pelo baterista. Edição limitada e numerada.', 0, '🥁', 'Em breve', '{}', false, 6)
ON CONFLICT DO NOTHING;
