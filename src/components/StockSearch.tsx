'use client'

import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import type { SearchResult } from '@/types'

interface StockSearchProps {
  onSelect: (symbol: string, name: string) => void
  placeholder?: string
}

export default function StockSearch({ onSelect, placeholder = 'Search stocks...' }: StockSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 1) {
      setResults([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
        setIsOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent text-sm"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-surface-4 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
          {results.map((result, i) => (
            <button
              key={`${result.symbol}-${i}`}
              onClick={() => {
                onSelect(result.symbol, result.instrument_name)
                setQuery(result.symbol)
                setIsOpen(false)
              }}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-3 transition-colors text-left"
            >
              <div>
                <span className="font-medium text-text-primary">{result.symbol}</span>
                <p className="text-xs text-text-secondary truncate max-w-[250px]">
                  {result.instrument_name}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-text-muted">{result.exchange}</span>
                <p className="text-xs text-text-muted">{result.instrument_type}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
