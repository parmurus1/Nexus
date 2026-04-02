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
