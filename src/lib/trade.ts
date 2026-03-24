import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/twelvedata'

const DEFAULT_USER_ID = 'default-user'

interface TradeParams {
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  notes?: string
  aiSuggestionId?: string
}

interface TradeResult {
  trade: Record<string, unknown>
  message: string
}

export async function executeTrade(params: TradeParams): Promise<TradeResult> {
  const { symbol, side, quantity, notes, aiSuggestionId } = params

  if (!symbol || !side || !quantity || quantity <= 0) {
    throw new Error('Invalid trade parameters')
  }

  // Get current price
  const price = await getPrice(symbol)
  const total = price * quantity

  // Get portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .single()

  if (!portfolio) {
    throw new Error('Portfolio not found')
  }

  let pnl: number | null = null

  if (side === 'buy') {
    if (portfolio.cash_balance < total) {
      throw new Error(
        `Insufficient funds. Need $${total.toFixed(2)} but only have $${portfolio.cash_balance.toFixed(2)}`
      )
    }

    await supabase
      .from('portfolios')
      .update({ cash_balance: portfolio.cash_balance - total })
      .eq('id', portfolio.id)

    const { data: existingPosition } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .eq('symbol', symbol.toUpperCase())
      .single()

    if (existingPosition && existingPosition.quantity > 0) {
      const newQty = existingPosition.quantity + quantity
      const newAvg =
        (existingPosition.avg_price * existingPosition.quantity + price * quantity) / newQty
      await supabase
        .from('positions')
        .update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() })
        .eq('id', existingPosition.id)
    } else if (existingPosition) {
      await supabase
        .from('positions')
        .update({ quantity, avg_price: price, side: 'long', updated_at: new Date().toISOString() })
        .eq('id', existingPosition.id)
    } else {
      await supabase.from('positions').insert({
        portfolio_id: portfolio.id,
        symbol: symbol.toUpperCase(),
        quantity,
        avg_price: price,
        side: 'long',
      })
    }
  } else if (side === 'sell') {
    const { data: position } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .eq('symbol', symbol.toUpperCase())
      .single()

    if (!position || position.quantity < quantity) {
      throw new Error(
        `Insufficient shares. Have ${position?.quantity || 0} shares of ${symbol}`
      )
    }

    pnl = (price - position.avg_price) * quantity

    await supabase
      .from('portfolios')
      .update({ cash_balance: portfolio.cash_balance + total })
      .eq('id', portfolio.id)

    const newQty = position.quantity - quantity
    await supabase
      .from('positions')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', position.id)
  }

  // Record trade
  const insertData: Record<string, unknown> = {
    portfolio_id: portfolio.id,
    symbol: symbol.toUpperCase(),
    side,
    quantity,
    price,
    total,
    pnl,
    notes: notes || null,
    status: 'filled',
  }

  if (aiSuggestionId) {
    insertData.ai_suggestion_id = aiSuggestionId
  }

  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .insert(insertData)
    .select()
    .single()

  if (tradeError) throw tradeError

  return {
    trade: trade as Record<string, unknown>,
    message: `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} shares of ${symbol.toUpperCase()} at $${price.toFixed(2)}`,
  }
}
