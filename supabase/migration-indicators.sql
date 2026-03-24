-- Custom Indicators Migration
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS custom_indicators (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  name TEXT NOT NULL,
  description TEXT,
  pine_script TEXT NOT NULL,
  category TEXT DEFAULT 'custom',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_indicators_user ON custom_indicators(user_id);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS custom_indicators_updated_at ON custom_indicators;
CREATE TRIGGER custom_indicators_updated_at
  BEFORE UPDATE ON custom_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
