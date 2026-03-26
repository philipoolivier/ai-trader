'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, Brain, Loader2, X, Plus, Upload, Play } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { ChartAnalysisResponse } from '@/types'

interface Screenshot {
  id: string
  base64: string
  mimeType: string
  label: string
  preview: string
}

interface ChartScreenshotButtonProps {
  chartRef: React.RefObject<HTMLDivElement | null>
  symbol: string
  onAnalysisComplete?: (analysis: ChartAnalysisResponse, suggestionId: string) => void
}

export default function ChartScreenshotButton({ chartRef, symbol, onAnalysisComplete }: ChartScreenshotButtonProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [analysis, setAnalysis] = useState<ChartAnalysisResponse | null>(null)
  const [analysisText, setAnalysisText] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const captureScreen = async () => {
    if (!symbol) {
      setError('Select a symbol first')
      return
    }

    setCapturing(true)
    setError('')

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions)

      const video = document.createElement('video')
      video.srcObject = stream
      video.autoplay = true
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play()
          setTimeout(resolve, 500)
        }
      })

      const canvas = document.createElement('canvas')

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

      stream.getTracks().forEach(t => t.stop())
      video.srcObject = null

      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]

      addScreenshot(base64, 'image/png', dataUrl)
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Screen capture cancelled')
      } else {
        setError('Failed to capture chart')
      }
    } finally {
      setCapturing(false)
    }
  }

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        const base64 = dataUrl.split(',')[1]
        addScreenshot(base64, file.type, dataUrl)
      }
      reader.readAsDataURL(file)
    })

    // Reset input so same file can be selected again
    e.target.value = ''
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string
          const base64 = dataUrl.split(',')[1]
          addScreenshot(base64, file.type, dataUrl)
        }
        reader.readAsDataURL(file)
      }
    }
  }, [])

  const addScreenshot = (base64: string, mimeType: string, preview: string) => {
    const id = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const num = screenshots.length + 1
    setScreenshots(prev => [...prev, {
      id,
      base64,
      mimeType,
      label: `Chart ${num}`,
      preview,
    }])
  }

  const removeScreenshot = (id: string) => {
    setScreenshots(prev => prev.filter(s => s.id !== id))
  }

  const analyzeAll = async () => {
    if (screenshots.length === 0) {
      setError('Add at least one chart screenshot')
      return
    }

    setAnalyzing(true)
    setError('')
    setAnalysis(null)
    setAnalysisText('')

    try {
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: screenshots.map(s => s.base64),
          mimeTypes: screenshots.map(s => s.mimeType),
        }),
      })

      const data = await res.json()

      if (res.ok && (data.text || data.analysis)) {
        setAnalysisText(data.text || '')
        setAnalysis(data.analysis || null)
        if (data.analysis && data.suggestionId) {
          onAnalysisComplete?.(data.analysis, data.suggestionId)
        }
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Analysis failed: ${msg}`)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 p-4 space-y-3" onPaste={handlePaste}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Brain size={16} className="text-brand-400" />
          Multi-Timeframe Analysis
        </h4>
        <span className="text-xs text-text-muted">
          {screenshots.length} chart{screenshots.length !== 1 ? 's' : ''} added
        </span>
      </div>

      <p className="text-xs text-text-muted">
        Add charts from different timeframes. Capture the screen, upload files, or paste with Ctrl+V. Then hit Analyze.
      </p>

      {/* Screenshot thumbnails */}
      {screenshots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {screenshots.map((ss, i) => (
            <div key={ss.id} className="relative flex-shrink-0 group">
              <img
                src={ss.preview}
                alt={ss.label}
                className="w-28 h-20 object-cover rounded-lg border border-surface-3"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-b-lg text-center">
                TF {i + 1}
              </div>
              <button
                onClick={() => removeScreenshot(ss.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-loss rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={captureScreen}
          disabled={capturing || !symbol}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-1 justify-center',
            capturing ? 'bg-surface-3 text-text-muted' : 'bg-surface-2 hover:bg-surface-3 text-text-primary border border-surface-4'
          )}
        >
          {capturing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          Capture Screen
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text-primary border border-surface-4 transition-colors flex-1 justify-center"
        >
          <Upload size={14} />
          Upload
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Analyze button */}
      <button
        onClick={analyzeAll}
        disabled={analyzing || screenshots.length === 0}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full justify-center',
          analyzing
            ? 'bg-surface-3 text-text-muted'
            : screenshots.length === 0
              ? 'bg-surface-3 text-text-muted cursor-not-allowed'
              : 'bg-brand-600 hover:bg-brand-700 text-white'
        )}
      >
        {analyzing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Analyzing {screenshots.length} chart{screenshots.length !== 1 ? 's' : ''}...
          </>
        ) : (
          <>
            <Play size={16} />
            Analyze {screenshots.length > 0 ? `${screenshots.length} Chart${screenshots.length !== 1 ? 's' : ''}` : 'Charts'}
          </>
        )}
      </button>

      {error && (
        <div className="text-sm px-4 py-2.5 rounded-lg bg-loss/10 text-loss">{error}</div>
      )}

      {analysis && (
        <div className="bg-surface-2 rounded-xl border border-surface-3 p-4 space-y-3">
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

          <div className="grid grid-cols-3 gap-2 text-sm">
            {analysis.entry_price && (
              <div className="bg-surface-1 rounded-lg p-2">
                <span className="text-xs text-text-muted block">Entry</span>
                <span className="text-text-primary font-medium">{formatCurrency(analysis.entry_price)}</span>
              </div>
            )}
            {analysis.stop_loss && (
              <div className="bg-surface-1 rounded-lg p-2">
                <span className="text-xs text-text-muted block">Stop Loss</span>
                <span className="text-loss font-medium">{formatCurrency(analysis.stop_loss)}</span>
              </div>
            )}
            {analysis.take_profit && (
              <div className="bg-surface-1 rounded-lg p-2">
                <span className="text-xs text-text-muted block">Take Profit</span>
                <span className="text-profit font-medium">{formatCurrency(analysis.take_profit)}</span>
              </div>
            )}
          </div>

          {analysis.risk_reward_ratio && (
            <div className="text-xs text-text-muted">
              Risk/Reward: <span className="text-text-primary font-medium">1:{analysis.risk_reward_ratio.toFixed(1)}</span>
            </div>
          )}

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

          {analysisText && (
            <div className="text-sm text-text-secondary leading-relaxed max-h-64 overflow-y-auto prose prose-invert prose-sm">
              <div dangerouslySetInnerHTML={{ __html: analysisText.replace(/\n/g, '<br/>') }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
