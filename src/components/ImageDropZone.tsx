'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, Image as ImageIcon, X } from 'lucide-react'

interface ImageDropZoneProps {
  onImageReady: (base64: string, mimeType: string) => void
  analyzing: boolean
}

export default function ImageDropZone({ onImageReady, analyzing }: ImageDropZoneProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return

    // Resize and convert to base64
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxWidth = 1920
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(img, 0, 0, width, height)

        const base64 = canvas.toDataURL(file.type, 0.9)
        const base64Data = base64.split(',')[1]

        setPreview(base64)
        onImageReady(base64Data, file.type)
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [onImageReady])

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) processFile(file)
          break
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [processFile])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const clearImage = () => {
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      {preview && !analyzing ? (
        <div className="relative">
          <img
            src={preview}
            alt="Chart preview"
            className="w-full rounded-xl border border-surface-3 max-h-[400px] object-contain bg-surface-2"
          />
          <button
            onClick={clearImage}
            className="absolute top-2 right-2 p-1.5 bg-surface-0/80 rounded-lg hover:bg-surface-0 transition-colors"
          >
            <X size={16} className="text-text-secondary" />
          </button>
        </div>
      ) : analyzing ? (
        <div className="border-2 border-brand-600/30 rounded-xl p-12 text-center bg-brand-600/5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-600/10 mb-4">
            <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-text-primary font-medium mb-1">Analyzing chart...</p>
          <p className="text-text-muted text-sm">
            Identifying patterns, support/resistance, and trade setups
          </p>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-brand-600 bg-brand-600/5'
              : 'border-surface-4 hover:border-surface-4/80 hover:bg-surface-2/50'
          }`}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-surface-2 mb-4">
            {dragOver ? (
              <ImageIcon size={24} className="text-brand-400" />
            ) : (
              <Upload size={24} className="text-text-muted" />
            )}
          </div>
          <p className="text-text-primary font-medium mb-1">
            Upload a chart screenshot
          </p>
          <p className="text-text-muted text-sm mb-3">
            Drag & drop, click to browse, or <span className="text-brand-400">Ctrl+V</span> to paste
          </p>
          <p className="text-text-muted text-xs">PNG, JPG, WEBP up to 4MB</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
