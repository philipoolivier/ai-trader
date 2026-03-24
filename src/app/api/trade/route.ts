import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/twelvedata'

const DEFAULT_USER_ID = 'default-user'

export async function POST(request: Request) {
  try {
    const { symbol, side, quantity, notes } = await request.json()

    if (!symbol || !side || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid trade parameters' }, { status: 400 })
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
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    let pnl: number | null = null

    if (side === 'buy') {
      // Check sufficient cash
      if (portfolio.cash_balance < total) {
        return NextResponse.json(
          { error: `Insufficient funds. Need ${total.toFixed(2)} but only have ${portfolio.cash_balance.toFixed(2)}` },
          { status: 400 }
        )
      }

      // Deduct cash
      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance - total })
        .eq('id', portfolio.id)

      // Update or create position
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
      // Check position exists
      const { data: position } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio.id)
        .eq('symbol', symbol.toUpperCase())
        .single()

      if (!position || position.quantity < quantity) {
        return NextResponse.json(
          { error: `Insufficient shares. Have ${position?.quantity || 0} shares of ${symbol}` },
          { status: 400 }
        )
      }

      // Calculate P&L
      pnl = (price - position.avg_price) * quantity

      // Add cash back
      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance + total })
        .eq('id', portfolio.id)

      // Update position
      const newQty = position.quantity - quantity
      if (newQty === 0) {
        await supabase
          .from('positions')
          .update({ quantity: 0, updated_at: new Date().toISOString() })
          .eq('id', position.id)
      } else {
        await supabase
          .from('positions')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', position.id)
      }
    }

    // Record trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        portfolio_id: portfolio.id,
        symbol: symbol.toUpperCase(),
        side,
        quantity,
        price,
        total,
        pnl,
        notes: notes || null,
        status: 'filled',
      })
      .select()
      .single()

    if (tradeError) throw tradeError

    return NextResponse.json({
      trade,
      message: `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} shares of ${symbol.toUpperCase()} at $${price.toFixed(2)}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Trade failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
