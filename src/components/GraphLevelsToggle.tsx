import { useTranslation } from 'react-i18next'

/** Which subsidiaries the graph and the panel show: the direct holdings only,
 *  or the whole tree below the centre. Two labelled choices rather than one
 *  icon button — an icon alone did not say what it switched, or which state
 *  was on. */
export default function GraphLevelsToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation()
  const option = (value: boolean, label: string, hint: string) => (
    <button type="button" role="radio" aria-checked={on === value} title={hint}
            className={`graph-levels__option ${on === value ? 'graph-levels__option--active' : ''}`}
            onClick={() => { if (on !== value) onChange(value) }}>
      {label}
    </button>
  )
  return (
    <div className="graph-levels" role="radiogroup" aria-label={t('graph.levelsLabel')}>
      <span className="graph-levels__label">{t('graph.levelsLabel')}</span>
      {option(false, t('graph.levelsDirect'), t('graph.levelsDirectHint'))}
      {option(true, t('graph.levelsAll'), t('graph.levelsAllHint'))}
    </div>
  )
}
