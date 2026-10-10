import { displayName, entityLabel } from '../utils/displayName'
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { FiSearch, FiX } from 'react-icons/fi'
import { search, reportEvent } from '../services/api'
import { countryName } from '../utils/isoCountries'
import type { SearchResult } from '../types'

interface SearchBarProps {
  onSelect: (result: SearchResult) => void
  selectedLabel?: string   // set by parent when navigating programmatically
  placeholder?: string
  /** The country the search is scoped to ('' = all). Chosen in the graph's
   *  Filters panel; shown here as a chip, because a scope nobody can see is a
   *  search that silently finds less. */
  country?: string
  onCountryChange?: (country: string) => void
  // When a search finds nothing in the DB, verified users can scrape the typed query.
  // The chosen country travels with it: the sources have no idea one was picked
  // unless they are told, and each answers "Alphabet" with the American company.
  onScrapeQuery?: (query: string, country?: string) => void
  canScrape?: boolean
  // Open the login modal — makes the "sign in to search sources" hint actionable.
  onRequestLogin?: () => void
}

// Decide whether the debounced search should run for `query`, given a value we were told
// to skip — a programmatically-set label (navigation, "view on map", back/forward) or a
// just-selected result — whose setQuery must NOT trigger a search that reopens the
// dropdown. Matching by *value* (not a one-shot boolean) is what fixes the remount bug:
// when the graph tab re-mounts SearchBar with selectedLabel set, a boolean guard was
// eaten by the initial query='' effect pass, so the later query=label pass searched and
// popped the list open. The skip is consumed only by the pass whose query actually
// matches, then cleared.
export function consumeSkip(query: string, skip: string | null): { run: boolean; skip: string | null } {
  if (skip !== null && skip === query) return { run: false, skip: null }
  return { run: true, skip }
}

export interface SearchBarHandle {
  /** Empty the field and put the cursor in it.
   *
   * Exposed imperatively rather than driven by a prop so the caller can invoke it
   * *synchronously inside the click handler*. Mobile browsers only raise the
   * keyboard for a focus() that happens during the user's gesture; the same call
   * one tick later, from an effect reacting to a state change, focuses the field
   * silently and the keyboard never appears. */
  clearAndFocus: () => void
}

const SearchBar = forwardRef<SearchBarHandle, SearchBarProps>(function SearchBar(
  { onSelect, selectedLabel, country = '', onCountryChange, onScrapeQuery, canScrape, onRequestLogin }: SearchBarProps,
  ref,
) {
  const { t, i18n } = useTranslation()
  const [query, setQuery]           = useState<string>('')
  const [results, setResults]       = useState<SearchResult[]>([])
  const [open, setOpen]             = useState<boolean>(false)
  const [loading, setLoading]       = useState<boolean>(false)
  /** The row the keyboard is on: an index into the dropdown's rows (the
   *  results, then the "search the sources" row), -1 when none. Arrow keys
   *  move it, Enter takes it, the mouse sets it as it passes. Reset whenever
   *  the rows change, so a stale highlight never lands on a different company. */
  const [active, setActive]         = useState<number>(-1)
  const listRef    = useRef<HTMLUListElement>(null)
  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const skipQuery  = useRef<string | null>(null)
  const reqSeq     = useRef<number>(0)
  /**
   * The last search that ran and has not yet been accounted for.
   *
   * A search is only worth counting once it has *settled* — a result was taken,
   * or the user gave up. The box queries every 300ms while typing, so counting
   * requests would record "mi", "mic", "micr": not what anyone searched for, and
   * a sharper picture of someone's typing than of their intent.
   */
  const pending    = useRef<{ query: string; country: string; hits: number } | null>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        settleUnresolved()      // clicked away without taking anything
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        settleUnresolved()
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (selectedLabel == null) return
    skipQuery.current = selectedLabel
    setQuery(selectedLabel)
    setResults([])
    setOpen(false)
  }, [selectedLabel])

  useEffect(() => {
    const decision = consumeSkip(query, skipQuery.current)
    skipQuery.current = decision.skip
    if (!decision.run) return
    const q = query.trim()   // keyboard autocomplete can append a space; trim so the exact match still ranks first
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      // Guard against a slow earlier request (e.g. "mi") resolving AFTER a newer
      // one ("microsoft") and overwriting its results with the stale query's.
      const mySeq = ++reqSeq.current
      setLoading(true)
      try {
        const { data } = await search(q, country || undefined)
        if (mySeq !== reqSeq.current) return
        setResults(data)
        setActive(-1)
        setOpen(true)
        // Noted, not reported: it becomes a data point only once it settles.
        pending.current = { query: q, country, hits: data.length }
      } catch {
        if (mySeq === reqSeq.current) setResults([])
      } finally {
        if (mySeq === reqSeq.current) setLoading(false)
      }
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, country])

  useEffect(() => {
    if (active < 0) return
    listRef.current?.querySelector<HTMLElement>('.search-item--active')?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const settle = (outcome: 'selected' | 'zero' | 'abandoned', rank?: number) => {
    const p = pending.current
    if (!p) return
    pending.current = null
    try {
      reportEvent({ kind: 'search', query: p.query, country: p.country || undefined,
                    outcome, ...(rank === undefined ? {} : { rank }) })
    } catch {
      // Measurement sits directly in front of selecting a company. `reportEvent`
      // swallows its own network failures, but anything that throws on the way
      // in must not stop the click doing what the user asked for.
    }
  }

  /** Nothing was taken: either there was nothing to take, or nothing appealed. */
  const settleUnresolved = () => {
    const p = pending.current
    if (p) settle(p.hits === 0 ? 'zero' : 'abandoned')
  }

  const handleSelect = (result: SearchResult, rank?: number) => {
    settle('selected', rank)
    const nodeName = 'name' in result.node ? entityLabel(result.node) : ('full_name' in result.node ? result.node.full_name : '')
    // Setting query to the selected name must NOT re-trigger the debounced search
    // (which would reopen the dropdown). Also drop any in-flight request.
    skipQuery.current = nodeName || ''
    reqSeq.current++
    setQuery(nodeName || '')
    setResults([])
    setOpen(false)
    inputRef.current?.blur()
    onSelect(result)
  }

  const handleClear = () => {
    settleUnresolved()
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  useImperativeHandle(ref, () => ({ clearAndFocus: handleClear }))

  // The badge says what the node IS — company, holding, fund, voting group —
  // not the coarse Entity/Person split the API groups results by. Every entity
  // in the dropdown said "Entity" while the panel it opened said "Holding", and
  // the kind is the useful part when a search returns twenty similar names.
  //
  // Same classes, same translation keys and the same 'company' fallback as the
  // node panel, so a type added there is styled and named here without a second
  // edit. GLEIF entities that never got a type inferred fall back to 'company',
  // which is what the panel shows them as too.
  const badge = (r: SearchResult) => {
    const kind = r.type === 'Person'
      ? 'person'
      : (('type' in r.node && r.node.type) || 'company')
    return (
      <span className={`node-type-badge node-type-badge--${kind}`}>
        {t(`legend.${kind}`, { defaultValue: kind })}
      </span>
    )
  }

  /**
   * The row that lets a user start a fresh source search for what they typed.
   *
   * Rendered under BOTH an empty and a non-empty result list. It used to appear
   * only when the user could scrape, so anyone signed out or unverified who got
   * *some* result — searching "Alphabet" and matching an unrelated "SCI LF
   * ALPHABET" — saw no way to look the real company up, and no hint that the
   * option existed at all. The empty-result branch had always offered a sign-in
   * prompt; this makes the two consistent.
   *
   * The label names the chosen country, because the search that follows is
   * restricted to it: an empty result has to read as "not in Germany" rather
   * than "not anywhere".
   */
  /** What the "search the sources" row does when taken — by mouse or by
   *  Enter on it: the scrape for a verified user, the sign-in for anyone else
   *  the app can sign in, nothing for the bare hint. */
  const scrapeAction = (): (() => void) | null => {
    if (canScrape && onScrapeQuery) {
      return () => {
        const q = query.trim()
        setOpen(false)
        inputRef.current?.blur()
        onScrapeQuery(q, country || undefined)
      }
    }
    if (onRequestLogin) {
      return () => {
        setOpen(false)
        inputRef.current?.blur()
        onRequestLogin()
      }
    }
    return null
  }

  const scrapeRow = (labelKey: 'search.alsoScrape' | 'search.noResultsScrape') => {
    const where = country ? countryName(country, i18n.language) : null
    const act = scrapeAction()
    // The row after the results, if it can be taken at all.
    const rowIndex = results.length
    const activeCls = act && active === rowIndex ? ' search-item--active' : ''
    const rowProps = act ? {
      role: 'option' as const, id: `search-option-${rowIndex}`, 'aria-selected': active === rowIndex,
      onMouseEnter: () => setActive(rowIndex),
    } : {}
    if (canScrape && onScrapeQuery) {
      return (
        <li
          className={`search-item search-item--scrape${activeCls}`}
          {...rowProps}
          onMouseDown={act ?? undefined}
        >
          <span className="search-item__name">
            {where
              ? t(`${labelKey}In` as 'search.alsoScrapeIn' | 'search.noResultsScrapeIn',
                  { query: query.trim(), country: where })
              : t(labelKey, { query: query.trim() })}
          </span>
        </li>
      )
    }
    if (onRequestLogin) {
      return (
        <li
          className={`search-item search-item--scrape${activeCls}`}
          {...rowProps}
          onMouseDown={act ?? undefined}
        >
          <span className="search-item__name">{t('search.scrapeSignIn')}</span>
        </li>
      )
    }
    return (
      <li className="search-item search-item--hint">
        <span className="search-item__name">{t('search.scrapeSignIn')}</span>
      </li>
    )
  }

  // How many rows the keyboard can reach: the results, plus the sources row
  // when it can be taken.
  const rowCount = open ? results.length + (query.trim().length >= 2 && scrapeAction() ? 1 : 0) : 0

  /** Arrow keys walk the dropdown, Enter takes the row the keyboard is on.
   *  Nothing highlighted, Enter does nothing: picking the first hit unasked
   *  would open a namesake. Escape is handled document-wide above. */
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open && results.length > 0) { setOpen(true) }
      if (rowCount === 0) return
      e.preventDefault()                       // the caret stays where it is
      setActive(a => e.key === 'ArrowDown' ? Math.min(a + 1, rowCount - 1) : Math.max(a - 1, -1))
      return
    }
    if (e.key === 'Enter' && open) {
      const row = results[active]                 // undefined when nothing is highlighted
      if (row) { e.preventDefault(); handleSelect(row, active) }
      else if (active === results.length) { e.preventDefault(); scrapeAction()?.() }
    }
  }

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
          onKeyDown={onInputKeyDown}
          role="combobox" aria-autocomplete="list" aria-expanded={open && rowCount > 0}
          aria-controls="search-listbox"
          aria-activedescendant={open && active >= 0 && active < rowCount ? `search-option-${active}` : undefined}
        />
        {/* The scope, where the search is typed: chosen in the Filters panel,
            removable right here. */}
        {country && (
          <button type="button" className="search-country-chip"
                  title={t('search.countryChipClear', { country: countryName(country, i18n.language) })}
                  aria-label={t('search.countryChipClear', { country: countryName(country, i18n.language) })}
                  onMouseDown={e => { e.preventDefault(); onCountryChange?.('') }}>
            <span>{countryName(country, i18n.language)}</span>
            <FiX aria-hidden="true" />
          </button>
        )}
        {loading && <span className="search-spinner" />}
        {query && !loading && (
          <button className="search-clear-btn" onMouseDown={handleClear} tabIndex={-1} title="Clear">
            <FiX />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="search-dropdown" role="listbox" id="search-listbox" ref={listRef}>
          {results.map((r, i) => (
            <li
              key={r.node.id}
              className={`search-item${active === i ? ' search-item--active' : ''}`}
              role="option" id={`search-option-${i}`} aria-selected={active === i}
              onMouseEnter={() => setActive(i)}
              // The index is the clicked position: if people routinely take the
              // fourth result, the ranking is wrong and this is how that shows up.
              onMouseDown={() => handleSelect(r, i)}
            >
              {badge(r)}
              <span className="search-item__name"
                    title={'name' in r.node ? displayName(r.node).secondary ?? undefined : undefined}>
                {'name' in r.node ? entityLabel(r.node) : ('full_name' in r.node ? r.node.full_name : '')}
              </span>
              {'country' in r.node && r.node.country && (
                <span className="search-item__country">{countryName(r.node.country, i18n.language)}</span>
              )}
            </li>
          ))}
          {/* The top hits often aren't the company meant — "Alphabet" matching an
              unrelated "SCI LF ALPHABET" — so always offer the typed query, and
              prompt to sign in when the user can't run one. */}
          {query.trim().length >= 2 && scrapeRow('search.alsoScrape')}
        </ul>
      )}

      {/* Nothing in the DB → offer to search the sources for what was typed. */}
      {open && !loading && results.length === 0 && query.trim().length >= 2 && (
        <ul className="search-dropdown" role="listbox" id="search-listbox" ref={listRef}>
          {scrapeRow('search.noResultsScrape')}
        </ul>
      )}
    </div>
  )
})

export default SearchBar
