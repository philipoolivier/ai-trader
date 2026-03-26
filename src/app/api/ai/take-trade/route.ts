import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { executeTrade } from '@/lib/trade'
import { getPrice } from '@/lib/twelvedata'

export async function POST(request: Request) {
  try {
    const { suggestionId, symbol, side, lotSize, stopLoss, takeProfit } = await request.json()
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

    // Get current price and AI's suggested entry
    const currentPrice = await getPrice(symbol)
    const aiEntry = suggestion.entry_price ? parseFloat(suggestion.entry_price) : null
    const priceDiff = aiEntry ? Math.abs(aiEntry - currentPrice) / currentPrice : 0

    // If AI entry is more than 0.1% away from current price, create pending order
    if (aiEntry && priceDiff > 0.001) {
      let orderType: string
      if (side === 'buy') {
        orderType = aiEntry > currentPrice ? 'buy_stop' : 'buy_limit'
      } else {
        orderType = aiEntry < currentPrice ? 'sell_stop' : 'sell_limit'
      }

      try {
        const { data: order, error: orderError } = await supabase
          .from('pending_orders')
          .insert({
            symbol: symbol.toUpperCase(),
            side,
            lot_size: lots,
            entry_price: aiEntry,
            stop_loss: stopLoss || suggestion.stop_loss || null,
            take_profit: takeProfit || suggestion.take_profit || null,
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

        const slText = stopLoss || suggestion.stop_loss ? `SL: $${(stopLoss || suggestion.stop_loss).toFixed(2)}` : 'no SL'
        const tpText = takeProfit || suggestion.take_profit ? `TP: $${(takeProfit || suggestion.take_profit).toFixed(2)}` : 'no TP'

        return NextResponse.json({
          trade: order,
          message: `${orderType.replace('_', ' ').toUpperCase()} placed: ${lots} lots ${symbol.toUpperCase()} at $${aiEntry.toFixed(2)} (${slText}, ${tpText}). Waiting for price to reach entry.`,
          orderType,
        })
      } catch {
        // If pending_orders table doesn't exist, fall through to market order
      }
    }

    // Execute market order immediately
    const result = await executeTrade({
      symbol,
      side,
      lotSize: lots,
      stopLoss: stopLoss || (suggestion.stop_loss ? parseFloat(suggestion.stop_loss) : null),
      takeProfit: takeProfit || (suggestion.take_profit ? parseFloat(suggestion.take_profit) : null),
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
    console.error('Take trade error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
