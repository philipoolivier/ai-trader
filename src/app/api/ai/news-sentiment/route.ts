import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getForexNews } from '@/lib/finnhub'
import { analyzeSentiment } from '@/lib/claude'

export const maxDuration = 30

export async function GET() {
  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('news_sentiment_cache')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false })

    if (cached && cached.length > 0) {
      return NextResponse.json(cached)
    }

    // Fetch fresh news
    const headlines = await getForexNews()

    if (headlines.length === 0) {
      return NextResponse.json([])
    }

    // Analyze with Claude
    const sentimentResults = await analyzeSentiment(
      headlines.map((h) => ({ title: h.title, source: h.source }))
    )

    // Cache results
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000) // 30 min

    // Clear old cache
    await supabase
      .from('news_sentiment_cache')
      .delete()
      .lt('expires_at', now.toISOString())

    // Insert new cache entries
    const cacheEntries = sentimentResults.map((result) => ({
      pair: result.pair,
      sentiment_score: result.score,
      sentiment_label: result.label,
      headlines: headlines.map((h) => ({
        title: h.title,
        source: h.source,
        url: h.url,
        published_at: h.published_at,
        individual_score: 0,
      })),
      analysis_summary: result.summary,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }))

    if (cacheEntries.length > 0) {
      await supabase.from('news_sentiment_cache').insert(cacheEntries)
    }

    // Return fresh data
    const { data: fresh } = await supabase
      .from('news_sentiment_cache')
      .select('*')
      .gt('expires_at', now.toISOString())
      .order('sentiment_score', { ascending: false })

    return NextResponse.json(fresh || cacheEntries)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch sentiment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
