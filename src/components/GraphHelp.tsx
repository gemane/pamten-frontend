import { useTranslation } from 'react-i18next'
import { ENTITY_COLORS } from '../utils/entityColors'

/** "Help — reading the graph": the marker glossary — node colours, the dimmed
 *  entry, the corroboration badges, the ⚡ and nominee marks, edge widths and
 *  styles. Lives on the Data page next to the sources it explains, always
 *  open: a reader who came here wondering what a badge means should not
 *  have to find and click a toggle first. */
export default function GraphHelp() {
  const { t } = useTranslation()
  return (
    <section className="graph-help">
      <h3 className="graph-help__title">{t('coverage.help.title')}</h3>
      <div className="help-glossary">
        <div className="help-item">
          <span className="help-sample">
            {(['company', 'person', 'fund', 'holding', 'government', 'foundation', 'nonprofit', 'brand', 'voting_group'] as const).map(k => (
              <span key={k} className="help-dot" title={t(`legend.${k}`)}
                    style={{ background: ENTITY_COLORS[k].fill, borderColor: ENTITY_COLORS[k].border }} />
            ))}
          </span>
          <span className="help-text">{t('coverage.help.colors')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="help-stale">{t('coverage.help.dimmedSample')}</span></span>
          <span className="help-text">{t('trust.staleHint')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="corroboration-badge corroboration-badge--confirmed">✓ 2</span></span>
          <span className="help-text">{t('coverage.help.corroborated')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="corroboration-badge corroboration-badge--community">{t('trust.community')}</span></span>
          <span className="help-text">{t('trust.communityHint')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="help-marker">⚡</span></span>
          <span className="help-text">{t('ownershipType.specialVotingHint')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="nominee-badge">{t('panel.nominee')}</span></span>
          <span className="help-text">{t('panel.nomineeHint')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="help-edge help-edge--thin" /><span className="help-edge help-edge--thick" /></span>
          <span className="help-text">{t('coverage.help.edgeWidth')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="help-edge help-edge--dashed" /></span>
          <span className="help-text">{t('legend.ultimateParent')}</span>
        </div>
        <div className="help-item">
          <span className="help-sample"><span className="help-edge help-edge--dotted" /></span>
          <span className="help-text">{t('coverage.help.votingEdge')}</span>
        </div>
      </div>
    </section>
  )
}
