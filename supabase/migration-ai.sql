-- AI Features Migration
-- Run this in Supabase SQL Editor if you already have the base tables

-- AI Suggestions table
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  image_data TEXT,
  symbol TEXT,
  direction TEXT CHECK (direction IN ('buy', 'sell')),
  entry_price DECIMAL(15, 4),
  stop_loss DECIMAL(15, 4),
  take_profit DECIMAL(15, 4),
  confidence INTEGER CHECK (confidence BETWEEN 1 AND 10),
  reasoning TEXT,
  patterns TEXT[],
  raw_analysis JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'taken', 'skipped')),
  trade_id UUID REFERENCES trades(id),
  outcome_pnl DECIMAL(15, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add ai_suggestion_id column to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS ai_suggestion_id UUID REFERENCES ai_suggestions(id);

-- News sentiment cache table
CREATE TABLE IF NOT EXISTS news_sentiment_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pair TEXT NOT NULL,
  sentiment_score DECIMAL(5, 2) NOT NULL,
  sentiment_label TEXT NOT NULL CHECK (sentiment_label IN ('bullish', 'bearish', 'neutral')),
  headlines JSONB NOT NULL,
  analysis_summary TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_portfolio ON ai_suggestions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created ON ai_suggestions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_ai_suggestion ON trades(ai_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_pair ON news_sentiment_cache(pair);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_expires ON news_sentiment_cache(expires_at);
