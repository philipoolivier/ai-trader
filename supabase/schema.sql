-- AI Trader - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  cash_balance DECIMAL(15, 2) NOT NULL DEFAULT 500.00,
  initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 500.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Positions table
CREATE TABLE IF NOT EXISTS positions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  avg_price DECIMAL(15, 4) NOT NULL DEFAULT 0,
  side TEXT NOT NULL DEFAULT 'long' CHECK (side IN ('long', 'short')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id, symbol)
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity INTEGER NOT NULL,
  price DECIMAL(15, 4) NOT NULL,
  total DECIMAL(15, 2) NOT NULL,
  pnl DECIMAL(15, 2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'filled' CHECK (status IN ('filled', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio snapshots for equity curve
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  total_value DECIMAL(15, 2) NOT NULL,
  cash_balance DECIMAL(15, 2) NOT NULL,
  positions_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_trades_portfolio ON trades(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio ON portfolio_snapshots(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON portfolio_snapshots(created_at);

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

-- Add ai_suggestion_id to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS ai_suggestion_id UUID REFERENCES ai_suggestions(id);

-- Add stop_loss and take_profit to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(15, 4);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS take_profit DECIMAL(15, 4);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pending orders (stop/limit orders)
CREATE TABLE IF NOT EXISTS pending_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  lot_size DECIMAL(10, 2) NOT NULL DEFAULT 0.01,
  entry_price DECIMAL(15, 4) NOT NULL,
  stop_loss DECIMAL(15, 4),
  take_profit DECIMAL(15, 4),
  order_type TEXT NOT NULL CHECK (order_type IN ('buy_stop', 'buy_limit', 'sell_stop', 'sell_limit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'triggered', 'cancelled')),
  ai_suggestion_id UUID REFERENCES ai_suggestions(id),
  triggered_trade_id UUID REFERENCES trades(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- AI Indexes
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_portfolio ON ai_suggestions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created ON ai_suggestions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_ai_suggestion ON trades(ai_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_pair ON news_sentiment_cache(pair);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_expires ON news_sentiment_cache(expires_at);

-- Row Level Security (RLS) - Disabled for simplicity with site-level auth
-- If you add user auth later, enable RLS and add policies:
-- ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS portfolios_updated_at ON portfolios;
CREATE TRIGGER portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS positions_updated_at ON positions;
CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
