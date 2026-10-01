import { useTranslation } from 'react-i18next'
import { FiGitMerge } from 'react-icons/fi'

/** The "all levels" switch: the whole subsidiary tree below the centre, in the
 *  graph and — indented — in the panel, instead of the direct holdings only. */
export default function GraphLevelsToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation()
  const label = on ? t('graph.allLevelsOff') : t('graph.allLevelsOn')
  return (
    <div className="graph-levels">
      <button type="button" aria-pressed={on} title={label} aria-label={label}
              className={`graph-filter__toggle ${on ? 'graph-filter__toggle--on' : ''}`}
              onClick={() => onChange(!on)}>
        <FiGitMerge style={{ transform: 'rotate(180deg)' }} />
        {on && <span className="graph-filter__value">{t('graph.allLevelsChip')}</span>}
      </button>
    </div>
  )
}
