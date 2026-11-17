-- ============================================================
-- 060_ai_gemini_provider.sql — add Gemini as a supported AI provider
-- ============================================================
-- The CHECK constraints on ai_configs and ai_usage_log were created in
-- migration 046 and only allowed openai/anthropic/openai_compatible.
-- This migration extends them to also allow 'gemini'.

ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_provider_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'openai_compatible', 'gemini'));

ALTER TABLE ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;

ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'openai_compatible', 'gemini'));
