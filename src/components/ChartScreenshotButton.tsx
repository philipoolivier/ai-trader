'use client'

import { useState, useRef } from 'react'
import { Camera, Brain, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { ChartAnalysisResponse } from '@/types'

interface ChartScreenshotButtonProps {
  chartRef: React.RefObject<HTMLDivElement | null>
  symbol: string
  onAnalysisComplete?: (analysis: ChartAnalysisResponse, suggestionId: string) => void
}

export default function ChartScreenshotButton({ chartRef, symbol, onAnalysisComplete }: ChartScreenshotButtonProps) {
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<ChartAnalysisResponse | null>(null)
  const [analysisText, setAnalysisText] = useState('')
  const [suggestionId, setSuggestionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const captureChart = async () => {
    if (!symbol) {
      setError('Select a symbol first')
      return
    }

    setAnalyzing(true)
    setError('')
    setAnalysis(null)
    setAnalysisText('')

    try {
      // Use Screen Capture API to capture the chart
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions)

      // Create video element to grab a frame
      const video = document.createElement('video')
      video.srcObject = stream
      video.autoplay = true
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play()
          // Wait a frame for rendering
          setTimeout(resolve, 500)
        }
      })

      const canvas = document.createElement('canvas')

      // Crop to chart container if available
      if (chartRef.current) {
        const rect = chartRef.current.getBoundingClientRect()
        const scaleX = video.videoWidth / window.innerWidth
        const scaleY = video.videoHeight / window.innerHeight

        const cropX = Math.round(rect.left * scaleX)
        const cropY = Math.round(rect.top * scaleY)
        const cropW = Math.round(rect.width * scaleX)
        const cropH = Math.round(rect.height * scaleY)

        canvas.width = cropW
        canvas.height = cropH
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
      } else {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, 0, 0)
      }

      // Stop all tracks
      stream.getTracks().forEach(t => t.stop())
      video.srcObject = null

      const base64 = canvas.toDataURL('image/png').split(',')[1]

      // Send to AI analysis
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: 'image/png' }),
      })

      const data = await res.json()

      if (res.ok && (data.text || data.analysis)) {
        setAnalysisText(data.text || '')
        setAnalysis(data.analysis || null)
        setSuggestionId(data.suggestionId || null)
        if (data.analysis && data.suggestionId) {
          onAnalysisComplete?.(data.analysis, data.suggestionId)
        }
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Screen capture cancelled')
      } else {
        setError('Failed to capture chart')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={captureChart}
        disabled={analyzing || !symbol}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full justify-center',
          analyzing
            ? 'bg-surface-3 text-text-muted'
            : 'bg-brand-600 hover:bg-brand-700 text-white'
        )}
      >
        {analyzing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Analyzing chart...
          </>
        ) : (
          <>
            <Camera size={16} />
            <Brain size={16} />
            Capture & Analyze Chart
          </>
        )}
      </button>

      {error && (
        <div className="text-sm px-4 py-2.5 rounded-lg bg-loss/10 text-loss">{error}</div>
      )}

      {analysis && (
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Brain size={16} className="text-brand-400" />
              AI Analysis
            </h4>
            {analysis.confidence !== undefined && (
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded',
                analysis.confidence >= 7 ? 'bg-profit/10 text-profit' :
                analysis.confidence >= 4 ? 'bg-yellow-500/10 text-yellow-400' :
                'bg-loss/10 text-loss'
              )}>
                {analysis.confidence}/10 confidence
              </span>
            )}
          </div>

          {/* Direction */}
          {analysis.direction && (
            <div className="flex items-center gap-3">
              <span className={cn(
                'px-3 py-1 rounded-lg text-sm font-bold',
                analysis.direction === 'buy' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
              )}>
                {analysis.direction.toUpperCase()}
              </span>
              <span className="text-sm text-text-secondary">{analysis.symbol || symbol}</span>
            </div>
          )}

          {/* Key Levels */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            {analysis.entry_price && (
              <div className="bg-surface-2 rounded-lg p-2">
                <span className="text-xs text-text-muted block">Entry</span>
                <span className="text-text-primary font-medium">{formatCurrency(analysis.entry_price)}</span>
              </div>
            )}
            {analysis.stop_loss && (
              <div className="bg-surface-2 rounded-lg p-2">
                <span className="text-xs text-text-muted block">Stop Loss</span>
                <span className="text-loss font-medium">{formatCurrency(analysis.stop_loss)}</span>
              </div>
            )}
            {analysis.take_profit && (
              <div className="bg-surface-2 rounded-lg p-2">
                <span className="text-xs text-text-muted block">Take Profit</span>
                <span className="text-profit font-medium">{formatCurrency(analysis.take_profit)}</span>
              </div>
            )}
          </div>

          {/* R:R */}
          {analysis.risk_reward_ratio && (
            <div className="text-xs text-text-muted">
              Risk/Reward: <span className="text-text-primary font-medium">1:{analysis.risk_reward_ratio.toFixed(1)}</span>
            </div>
          )}

          {/* Trend & Patterns */}
          {(analysis.trend || (analysis.patterns && analysis.patterns.length > 0)) && (
            <div className="flex flex-wrap gap-1.5">
              {analysis.trend && (
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded',
                  analysis.trend === 'uptrend' ? 'bg-profit/10 text-profit' :
                  analysis.trend === 'downtrend' ? 'bg-loss/10 text-loss' :
                  'bg-surface-3 text-text-secondary'
                )}>
                  {analysis.trend}
                </span>
              )}
              {analysis.patterns?.map((p, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded bg-surface-3 text-text-secondary">{p}</span>
              ))}
            </div>
          )}

          {/* Reasoning */}
          {analysisText && (
            <div className="text-sm text-text-secondary leading-relaxed max-h-48 overflow-y-auto prose prose-invert prose-sm">
              <div dangerouslySetInnerHTML={{ __html: analysisText.replace(/\n/g, '<br/>') }} />
            </div>
          )}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
