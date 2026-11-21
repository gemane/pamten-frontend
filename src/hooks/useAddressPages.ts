import { useCallback, useEffect, useState } from 'react'
import { getCompaniesAtAddress } from '../services/api'
import type { Entity } from '../types'

/** Pages of the companies at one address, the list growing by "show more":
 *  `first` is what the caller already holds (the profile's section, or
 *  nothing), `skip` an id never listed (the company whose profile it is —
 *  the endpoint lists everyone at the door), `firstPage` how many the first
 *  request asks for when the caller holds nothing. Shared by the panel's
 *  section, the address node's panel, the map panel and a pin's popup, so
 *  "N more" is everywhere a button that fetches them. */
export function useAddressPages(key: string | undefined, first: Entity[] | null, firstCount: number | null,
                                skip?: string, firstPage?: number) {
  const [rows, setRows] = useState<Entity[]>(first ?? [])
  const [count, setCount] = useState<number | null>(firstCount)
  const [address, setAddress] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // where the next page starts on the server, which also lists `skip`
  const [offset, setOffset] = useState(first ? first.length + (skip ? 1 : 0) : 0)
  const load = useCallback(async (from: number) => {
    if (!key) return
    setBusy(true)
    try {
      // the first page may be short (a pin's popup names a handful); the next ones are full
      const { data } = from === 0 && firstPage
        ? await getCompaniesAtAddress(key, from, firstPage)
        : await getCompaniesAtAddress(key, from)
      setRows(prev => {
        const seen = new Set(prev.map(e => e.id))
        return [...prev, ...data.entities.filter(e => e.id !== skip && !seen.has(e.id))]
      })
      setCount(data.count - (skip ? 1 : 0))
      setAddress(data.address ?? null)
      setOffset(from + data.entities.length)
    } catch { /* the rows shown stay; the button stays to try again */ }
    finally { setBusy(false) }
  }, [key, skip])
  useEffect(() => {
    setRows(first ?? []); setCount(firstCount); setAddress(null)
    setOffset(first ? first.length + (skip ? 1 : 0) : 0)
    if (!first) void load(0)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, count, address, busy, more: () => load(offset) }
}
