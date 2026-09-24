import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dismissKey, type UpdateState } from '../utils/appVersionCheck'

function openStore(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function isDismissed(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

/**
 * What the minimum-version check shows (see utils/appVersionCheck.ts):
 *
 * - **required** — a full-screen, non-dismissible screen over the whole app. The
 *   backend only says this when this build must not keep running, so there is
 *   deliberately no "continue anyway". Without a store link it still explains.
 * - **available** — a banner at the bottom with "Update" and "Later". "Later"
 *   is remembered per offered version, so the next release asks again.
 */
export default function UpdateGate({ state }: { state: UpdateState }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  const key = state.kind === 'available' ? dismissKey(state.latest) : ''

  useEffect(() => { setDismissed(key ? isDismissed(key) : false) }, [key])

  if (state.kind === 'required') {
    return (
      <div className="update-gate" role="alertdialog" aria-modal="true"
           aria-labelledby="update-gate-title" aria-describedby="update-gate-text">
        <div className="update-gate__card">
          <h2 id="update-gate-title">{t('update.requiredTitle')}</h2>
          <p id="update-gate-text">{state.message ?? t('update.requiredText')}</p>
          {state.storeUrl && (
            <button type="button" className="update-gate__button" onClick={() => openStore(state.storeUrl!)}>
              {t('update.button')}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (state.kind === 'available' && !dismissed) {
    return (
      <div className="update-banner" role="status">
        <span className="update-banner__text">{state.message ?? t('update.availableText')}</span>
        {state.storeUrl && (
          <button type="button" className="update-banner__button" onClick={() => openStore(state.storeUrl!)}>
            {t('update.button')}
          </button>
        )}
        <button type="button" className="update-banner__later"
                onClick={() => {
                  try { localStorage.setItem(key, '1') } catch { /* private mode: dismiss for this session */ }
                  setDismissed(true)
                }}>
          {t('update.later')}
        </button>
      </div>
    )
  }

  return null
}
