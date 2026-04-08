-- =====================================================
-- MIGRAÇÃO: Adicionar coluna gratuito na tabela shows
-- =====================================================
-- Execute este SQL no painel do Supabase (SQL Editor)
-- para corrigir o problema de criação/edição de shows
-- =====================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS gratuito BOOLEAN DEFAULT false;

-- Atualizar shows existentes sem link para serem gratuitos (opcional)
-- UPDATE shows SET gratuito = true WHERE link IS NULL OR link = '';
