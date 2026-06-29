import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FiSearch, FiX } from 'react-icons/fi'
import { search } from '../services/api'
import type { SearchResult } from '../types'

interface SearchBarProps {
  onSelect: (result: SearchResult) => void
  selectedLabel?: string   // set by parent when navigating programmatically
  placeholder?: string
}

export default function SearchBar({ onSelect, selectedLabel }: SearchBarProps) {
  const { t } = useTranslation()
  const [query, setQuery]     = useState<string>('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen]       = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const skipSearch = useRef<boolean>(false)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (selectedLabel == null) return
    skipSearch.current = true
    setQuery(selectedLabel)
    setResults([])
    setOpen(false)
  }, [selectedLabel])

  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return }
    if (query.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await search(query)
        setResults(data)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  const handleSelect = (result: SearchResult) => {
    const nodeName = 'name' in result.node ? result.node.name : ('full_name' in result.node ? result.node.full_name : '')
    setQuery(nodeName || '')
    setResults([])
    setOpen(false)
    inputRef.current?.blur()
    onSelect(result)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const badge = (type: string) => (
    <span className={`type-badge type-badge--${type.toLowerCase()}`}>{type}</span>
  )

  return (
    <div className="search-wrap" ref={wrapRef}>
      <div className={`search-box ${loading ? 'search-box--loading' : ''}`}>
        <FiSearch className="search-icon" />
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="search-spinner" />}
        {query && !loading && (
          <button className="search-clear-btn" onMouseDown={handleClear} tabIndex={-1} title="Clear">
            <FiX />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map(r => (
            <li
              key={r.node.id}
              className="search-item"
              onMouseDown={() => handleSelect(r)}
            >
              {badge(r.type)}
              <span className="search-item__name">
                {'name' in r.node ? r.node.name : ('full_name' in r.node ? r.node.full_name : '')}
              </span>
              {'country' in r.node && r.node.country && (
                <span className="search-item__country">{r.node.country}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
