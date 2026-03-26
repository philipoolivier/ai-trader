import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { executeTrade } from '@/lib/trade'
import { getPrice } from '@/lib/twelvedata'

export async function POST(request: Request) {
  try {
    const { suggestionId, symbol, side, lotSize, stopLoss, takeProfit, entryPrice } = await request.json()
    const lots = lotSize || 0.01

    if (!suggestionId || !symbol || !side) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify suggestion exists and is pending
    const { data: suggestion } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .eq('status', 'pending')
      .single()

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found or already acted on' }, { status: 404 })
    }

    // Check if entry price differs from current price — create pending order
    const currentPrice = await getPrice(symbol)
    const entry = entryPrice || currentPrice
    const priceDiff = Math.abs(entry - currentPrice) / currentPrice

    // If entry is more than 0.1% away from current price, create pending order
    if (priceDiff > 0.001 && entryPrice) {
      let orderType: string
      if (side === 'buy') {
        orderType = entryPrice > currentPrice ? 'buy_stop' : 'buy_limit'
      } else {
        orderType = entryPrice < currentPrice ? 'sell_stop' : 'sell_limit'
      }

      const { data: order, error: orderError } = await supabase
        .from('pending_orders')
        .insert({
          symbol: symbol.toUpperCase(),
          side,
          lot_size: lots,
          entry_price: entryPrice,
          stop_loss: stopLoss || null,
          take_profit: takeProfit || null,
          order_type: orderType,
          status: 'pending',
          ai_suggestion_id: suggestionId,
        })
        .select()
        .single()

      if (orderError) throw orderError

      // Update suggestion status
      await supabase
        .from('ai_suggestions')
        .update({ status: 'taken' })
        .eq('id', suggestionId)

      return NextResponse.json({
        trade: order,
        message: `${orderType.replace('_', ' ').toUpperCase()} placed: ${lots} lots ${symbol.toUpperCase()} at $${entryPrice.toFixed(2)} (SL: ${stopLoss ? '$' + stopLoss.toFixed(2) : 'none'}, TP: ${takeProfit ? '$' + takeProfit.toFixed(2) : 'none'})`,
        orderType,
      })
    }

    // Execute market order immediately
    const result = await executeTrade({
      symbol,
      side,
      lotSize: lots,
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      notes: `AI suggestion (confidence: ${suggestion.confidence}/10) - ${suggestion.reasoning?.slice(0, 100)}`,
      aiSuggestionId: suggestionId,
    })

    // Update suggestion status
    await supabase
      .from('ai_suggestions')
      .update({
        status: 'taken',
        trade_id: (result.trade as Record<string, unknown>).id as string,
      })
      .eq('id', suggestionId)

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute AI trade'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
