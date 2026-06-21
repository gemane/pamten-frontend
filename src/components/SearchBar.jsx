import { useState, useEffect, useRef } from 'react'
import { FiSearch } from 'react-icons/fi'
import { search } from '../services/api'

export default function SearchBar({ onSelect }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const timer    = useRef(null)
  const wrapRef  = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    clearTimeout(timer.current)
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
    return () => clearTimeout(timer.current)
  }, [query])

  const handleSelect = (result) => {
    setQuery(result.node.name || result.node.full_name || '')
    setOpen(false)
    onSelect(result)
  }

  const badge = (type) => (
    <span className={`type-badge type-badge--${type.toLowerCase()}`}>{type}</span>
  )

  return (
    <div className="search-wrap" ref={wrapRef}>
      <div className={`search-box ${loading ? 'search-box--loading' : ''}`}>
        <FiSearch className="search-icon" />
        <input
          className="search-input"
          type="text"
          placeholder="Search companies, brands, people…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="search-spinner" />}
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
                {r.node.name || r.node.full_name}
              </span>
              {r.node.country && (
                <span className="search-item__country">{r.node.country}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
