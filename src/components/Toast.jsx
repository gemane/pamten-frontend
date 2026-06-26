import { useEffect } from 'react'
import { FiX, FiAlertCircle, FiCheckCircle, FiInfo } from 'react-icons/fi'

const ICONS  = { error: FiAlertCircle, success: FiCheckCircle, info: FiInfo }
const COLORS = { error: '#e74c3c',     success: '#2ECC71',      info: '#4A90D9' }

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null

  const Icon  = ICONS[toast.type]  || FiInfo
  const color = COLORS[toast.type] || COLORS.info

  return (
    <div className={`toast toast--${toast.type}`} style={{ borderLeftColor: color }}>
      <Icon className="toast__icon" style={{ color }} />
      <span className="toast__msg">{toast.message}</span>
      <button className="toast__close" onClick={onClose}><FiX /></button>
    </div>
  )
}
