import { useState, useEffect, useRef } from 'react'
import { search } from '../api'

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await search(query)
        setResults(data)
        setOpen(true)
      } catch {
        // silently ignore search errors
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query])

  const handleSelect = (result) => {
    setQuery(result.node.name || result.node.full_name || '')
    setOpen(false)
    onSelect(result)
  }

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <div className="search-bar">
        <svg className="search-icon" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search companies, people..."
          className="search-input"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="search-spinner" />}
      </div>
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map(r => (
            <li
              key={r.node.id}
              className="search-result-item"
              onMouseDown={() => handleSelect(r)}
            >
              <span className={`result-badge ${r.type.toLowerCase()}`}>{r.type}</span>
              <span className="result-name">{r.node.name || r.node.full_name}</span>
              {r.node.country && <span className="result-meta">{r.node.country}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
