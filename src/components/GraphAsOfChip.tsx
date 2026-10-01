import { useTranslation } from 'react-i18next'
import { FiClock, FiX } from 'react-icons/fi'
import { asOfYear } from '../utils/asOf'

/** The time-travel marker on the canvas: which year the graph shows, the way
 *  back to the present, and what the dimmed lines mean. */
export default function GraphAsOfChip({ asOf, onClear }: { asOf: string; onClear?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="graph-asof" role="status">
      <div className="graph-asof__chip">
        <FiClock aria-hidden="true" />
        <span>{t('asOf.chip', { year: asOfYear(asOf) })}</span>
        <button type="button" className="graph-asof__clear" onClick={onClear}
                title={t('asOf.clear')} aria-label={t('asOf.clear')}>
          <FiX />
        </button>
      </div>
      <div className="graph-asof__legend">
        <span className="graph-asof__swatch" aria-hidden="true" />
        {t('asOf.legend')}
      </div>
    </div>
  )
}
