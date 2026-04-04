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
-- MIGRAÇÃO: Tabelas de shows e produtos (merch)
-- Execute este bloco no SQL Editor do Supabase
-- =====================================================

-- Tabela de shows da agenda
CREATE TABLE IF NOT EXISTS shows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  local TEXT NOT NULL,
  data DATE NOT NULL,
  horario TEXT DEFAULT 'A confirmar',
  feito BOOLEAN DEFAULT false,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de produtos do merch
CREATE TABLE IF NOT EXISTS produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cat TEXT DEFAULT 'Geral',
  emoji TEXT DEFAULT '🎵',
  preco NUMERIC(10,2) DEFAULT 0,
  badge TEXT,
  descricao TEXT,
  sizes TEXT[] DEFAULT '{}',
  img TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

-- Leitura pública
CREATE POLICY "Leitura pública de shows" ON shows FOR SELECT USING (true);
CREATE POLICY "Leitura pública de produtos" ON produtos FOR SELECT USING (true);

-- Escrita apenas via service_role (backend/API)
CREATE POLICY "Escrita via service_role em shows" ON shows FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Escrita via service_role em produtos" ON produtos FOR ALL USING (auth.role() = 'service_role');

-- Inserir produtos padrão (opcional — pode remover se quiser começar do zero)
INSERT INTO produtos (nome, cat, emoji, preco, badge, descricao, sizes, ativo) VALUES
  ('CAMISETA OFICIAL', 'Vestuário', '👕', 0, 'Novo', '100% algodão, estampa serigrafia com o logo da banda. Lavagem à mão recomendada.', ARRAY['P','M','G','GG'], true),
  ('PALHETA EXCLUSIVA', 'Acessórios', '🎸', 0, NULL, 'Palheta personalizada com o logo da Nexus. Espessura média. Pack com 3 unidades.', '{}', true),
  ('CHAVEIRO NEXUS', 'Acessórios', '🔑', 0, NULL, 'Chaveiro metálico com o símbolo da Nexus. Acabamento premium, gravação a laser.', '{}', true),
  ('PIN COLECIONÁVEL', 'Acessórios', '📌', 0, NULL, 'Pin esmaltado com o logo da Nexus. Ideal para jaquetas e mochilas.', '{}', true),
  ('PACK ADESIVOS', 'Colecionáveis', '🎨', 0, NULL, '6 adesivos em vinil impermeável com artes exclusivas da banda.', '{}', true),
  ('BAQUETAS ASSINADAS', 'Colecionáveis', '🥁', 0, 'Em breve', 'Baquetas autografadas pelo baterista. Edição limitada e numerada.', '{}', false)
ON CONFLICT DO NOTHING;

-- Inserir shows padrão (opcional)
INSERT INTO shows (nome, local, data, horario, feito) VALUES
  ('Palco Arteculando', 'Casa de Cultura Hip-Hop Sul — São Paulo', '2026-04-25', 'A confirmar', false),
  ('BIBLIOTECA MUSICAL', 'Senac Nações Unidas — São Paulo', '2025-03-26', '18:15', true),
  ('HALLOWEEN SENAC', 'Senac Nações Unidas — São Paulo', '2024-10-30', '18:30', true)
ON CONFLICT DO NOTHING;
