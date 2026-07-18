import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiPlus, FiTrash2, FiDownloadCloud, FiLoader, FiAlertCircle, FiCheckCircle,
  FiServer, FiUploadCloud,
} from 'react-icons/fi'
import {
  getFederationStatus, getFederationPeers, addFederationPeer,
  deleteFederationPeer, pullFederationPeer,
} from '../services/api'
import type { FederationStatus, FederationPeer, PeerPullResult } from '../types'

export default function FederationPanel() {
  const { t } = useTranslation()
  const [status,  setStatus]  = useState<FederationStatus | null>(null)
  const [peers,   setPeers]   = useState<FederationPeer[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error,   setError]   = useState<string | null>(null)
  const [busy,    setBusy]    = useState<string | null>(null)   // peer id being pulled/deleted
  const [pullRes, setPullRes] = useState<Record<string, PeerPullResult>>({})
  const [adding,  setAdding]  = useState<boolean>(false)

  // add-peer form
  const [name,  setName]  = useState<string>('')
  const [url,   setUrl]   = useState<string>('')
  const [token, setToken] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: st } = await getFederationStatus()
      setStatus(st)
      if (st.enabled) {
        const { data } = await getFederationPeers()
        setPeers(data.peers)
      }
    } catch {
      setError(t('federation.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return
    setAdding(true); setError(null)
    try {
      await addFederationPeer({ name: name.trim(), base_url: url.trim(), auth_token: token.trim() || undefined })
      setName(''); setUrl(''); setToken('')
      const { data } = await getFederationPeers()
      setPeers(data.peers)
    } catch {
      setError(t('federation.addError'))
    } finally {
      setAdding(false)
    }
  }

  const handlePull = async (p: FederationPeer) => {
    setBusy(p.id); setError(null)
    try {
      const { data } = await pullFederationPeer(p.id)
      setPullRes(r => ({ ...r, [p.id]: data }))
      load()
    } catch {
      setError(t('federation.pullError'))
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (p: FederationPeer) => {
    setBusy(p.id); setError(null)
    try {
      await deleteFederationPeer(p.id)
      setPeers(prev => prev.filter(x => x.id !== p.id))
    } catch {
      setError(t('federation.deleteError'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fed-panel">
      <div className="fed-panel__header">
        <h4 className="fed-panel__title"><FiServer /> {t('federation.title')}</h4>
        {status && (
          <span className={`fed-badge ${status.enabled ? 'fed-badge--on' : 'fed-badge--off'}`}>
            {status.enabled ? t('federation.on') : t('federation.off')}
          </span>
        )}
      </div>
      <p className="fed-panel__desc">{t('federation.desc')}</p>

      {error && <div className="scraper-error"><FiAlertCircle /> {error}</div>}
      {loading && <div className="fed-empty"><FiLoader className="spin" /> {t('federation.loading')}</div>}

      {!loading && status && !status.enabled && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> {t('federation.disabled')}</div>
      )}

      {!loading && status?.enabled && (
        <>
          {/* what this instance publishes */}
          <div className="fed-publish">
            <FiUploadCloud className="fed-publish__icon" />
            <span>{t('federation.publishing', {
              entities: status.entities, persons: status.persons, ownerships: status.ownerships,
            })}</span>
          </div>

          {/* peer list */}
          <div className="fed-peers">
            {peers.length === 0 && <div className="fed-empty">{t('federation.noPeers')}</div>}
            {peers.map(p => {
              const res = pullRes[p.id]
              const isBusy = busy === p.id
              return (
                <div key={p.id} className="fed-peer">
                  <div className="fed-peer__info">
                    <span className="fed-peer__name">{p.name}</span>
                    <span className="fed-peer__url">{p.base_url}</span>
                    {p.has_token && <span className="fed-peer__tok">{t('federation.tokenSet')}</span>}
                  </div>
                  <div className="fed-peer__actions">
                    <button className="fed-pull-btn" onClick={() => handlePull(p)} disabled={isBusy}>
                      {isBusy
                        ? <><FiLoader className="spin" /> {t('federation.pulling')}</>
                        : <><FiDownloadCloud /> {t('federation.pull')}</>}
                    </button>
                    <button className="fed-del-btn" onClick={() => handleDelete(p)} disabled={isBusy}
                      title={t('federation.remove')}><FiTrash2 /></button>
                  </div>
                  {res && (
                    <div className="fed-peer__result">
                      <FiCheckCircle className="fed-peer__result-icon" />
                      {t('federation.pullResult', {
                        entities: res.imported.entities, persons: res.imported.persons,
                        ownerships: res.imported.ownerships, merged: res.deduplication.merged_count,
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* add peer */}
          <div className="fed-add">
            <div className="fed-add__title">{t('federation.addTitle')}</div>
            <input className="scraper-input" type="text" placeholder={t('federation.namePlaceholder')}
              value={name} onChange={e => setName(e.target.value)} disabled={adding} />
            <input className="scraper-input" type="url" placeholder={t('federation.urlPlaceholder')}
              value={url} onChange={e => setUrl(e.target.value)} disabled={adding} />
            <input className="scraper-input" type="password" placeholder={t('federation.tokenPlaceholder')}
              value={token} onChange={e => setToken(e.target.value)} disabled={adding} />
            <button className="fed-add-btn" onClick={handleAdd} disabled={adding || !name.trim() || !url.trim()}>
              {adding
                ? <><FiLoader className="spin" /> {t('federation.adding')}</>
                : <><FiPlus /> {t('federation.add')}</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
