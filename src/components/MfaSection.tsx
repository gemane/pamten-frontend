import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { FiShield, FiCheckCircle, FiAlertCircle, FiLoader, FiCopy } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { authMfaStatus, authMfaSetup, authMfaEnable, authMfaDisable } from '../services/api'

type Step = 'idle' | 'setup' | 'recovery' | 'disable'

function errText(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  return typeof d === 'string' ? d : fallback
}

export default function MfaSection() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<boolean | null>(null)   // null = loading
  const [step,    setStep]    = useState<Step>('idle')
  const [setup,   setSetup]   = useState<{ secret: string; otpauth_uri: string } | null>(null)
  const [code,    setCode]    = useState<string>('')
  const [recovery, setRecovery] = useState<string[]>([])
  const [error,   setError]   = useState<string | null>(null)
  const [busy,    setBusy]    = useState<boolean>(false)

  useEffect(() => {
    authMfaStatus().then(({ data }) => setEnabled(data.mfa_enabled)).catch(() => setEnabled(false))
  }, [])

  const reset = () => { setStep('idle'); setSetup(null); setCode(''); setError(null) }

  const beginSetup = async () => {
    setBusy(true); setError(null)
    try {
      const { data } = await authMfaSetup()
      setSetup(data); setStep('setup')
    } catch (err) { setError(errText(err, t('settings.mfa.error'))) }
    finally { setBusy(false) }
  }

  const confirmEnable = async () => {
    setBusy(true); setError(null)
    try {
      const { data } = await authMfaEnable(code.trim())
      setRecovery(data.recovery_codes); setEnabled(true); setStep('recovery'); setCode('')
    } catch (err) { setError(errText(err, t('settings.mfa.badCode'))) }
    finally { setBusy(false) }
  }

  const confirmDisable = async () => {
    setBusy(true); setError(null)
    try {
      await authMfaDisable(code.trim())
      setEnabled(false); reset()
    } catch (err) { setError(errText(err, t('settings.mfa.badCode'))) }
    finally { setBusy(false) }
  }

  if (enabled === null) return null   // don't flash while loading status

  return (
    <div className="settings-section">
      <h4 className="settings-section__title">
        <FiShield style={{ marginRight: 6, verticalAlign: '-2px' }} />
        {t('settings.mfa.title')}
      </h4>

      {/* ── Not enrolled ─────────────────────────────────────────────── */}
      {!enabled && step === 'idle' && (
        <div className="mfa-box">
          <p className="mfa-box__desc">{t('settings.mfa.desc')}</p>
          <button className="mfa-btn" onClick={beginSetup} disabled={busy}>
            {busy ? <FiLoader className="spin" /> : <FiShield />} {t('settings.mfa.enable')}
          </button>
        </div>
      )}

      {/* ── Enrolling: QR + confirm code ─────────────────────────────── */}
      {step === 'setup' && setup && (
        <div className="mfa-box">
          <p className="mfa-box__desc">{t('settings.mfa.scan')}</p>
          <div className="mfa-qr"><QRCodeSVG value={setup.otpauth_uri} size={160} /></div>
          <p className="mfa-box__manual">{t('settings.mfa.manualKey')}<br /><code>{setup.secret}</code></p>
          <label className="modal__label">{t('settings.mfa.enterCode')}</label>
          <input
            className="modal__input" type="text" inputMode="numeric" autoComplete="one-time-code"
            placeholder="123456" value={code} onChange={e => setCode(e.target.value)} autoFocus
          />
          {error && <div className="modal__error"><FiAlertCircle /> {error}</div>}
          <div className="mfa-actions">
            <button className="mfa-btn" onClick={confirmEnable} disabled={busy || !code.trim()}>
              {busy ? <FiLoader className="spin" /> : <FiCheckCircle />} {t('settings.mfa.confirm')}
            </button>
            <button className="modal__linkbtn modal__linkbtn--muted" onClick={reset}>{t('settings.mfa.cancel')}</button>
          </div>
        </div>
      )}

      {/* ── Recovery codes (shown once) ─────────────────────────────── */}
      {step === 'recovery' && (
        <div className="mfa-box">
          <p className="mfa-box__desc mfa-box__desc--warn">{t('settings.mfa.recoveryNote')}</p>
          <div className="mfa-recovery">
            {recovery.map(c => <code key={c}>{c}</code>)}
          </div>
          <div className="mfa-actions">
            <button className="modal__linkbtn" onClick={() => navigator.clipboard?.writeText(recovery.join('\n'))}>
              <FiCopy /> {t('settings.mfa.copy')}
            </button>
            <button className="mfa-btn" onClick={reset}>{t('settings.mfa.done')}</button>
          </div>
        </div>
      )}

      {/* ── Enabled: disable flow ───────────────────────────────────── */}
      {enabled && step === 'idle' && (
        <div className="mfa-box">
          <p className="mfa-box__status"><FiCheckCircle /> {t('settings.mfa.enabled')}</p>
          <button className="modal__linkbtn modal__linkbtn--muted" onClick={() => { setStep('disable'); setError(null) }}>
            {t('settings.mfa.disable')}
          </button>
        </div>
      )}

      {step === 'disable' && (
        <div className="mfa-box">
          <p className="mfa-box__desc">{t('settings.mfa.disablePrompt')}</p>
          <input
            className="modal__input" type="text" inputMode="numeric" autoComplete="one-time-code"
            placeholder={t('auth.mfaCodePlaceholder')} value={code} onChange={e => setCode(e.target.value)} autoFocus
          />
          {error && <div className="modal__error"><FiAlertCircle /> {error}</div>}
          <div className="mfa-actions">
            <button className="mfa-btn mfa-btn--danger" onClick={confirmDisable} disabled={busy || !code.trim()}>
              {busy ? <FiLoader className="spin" /> : null} {t('settings.mfa.disable')}
            </button>
            <button className="modal__linkbtn modal__linkbtn--muted" onClick={reset}>{t('settings.mfa.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
