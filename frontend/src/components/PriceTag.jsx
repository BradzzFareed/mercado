import { useApp } from '../state'
import { Sparkline } from './Charts'
import { peso, pct, SIGNALS } from '../util'

export function SignalChip({ signal, children }) {
  const { t } = useApp()
  const s = SIGNALS[signal]
  return <span className={'chip ' + s.cls}><span aria-hidden="true">{s.arrow}</span>{children || t('sig.' + signal)}</span>
}

// A palengke-style price tag: cut corner, punched hole, big peso figure.
export function PriceTag({ item, commodity, horizon, onOpen, index = 0 }) {
  const { t, lang } = useApp()
  const hz = item.horizons[String(horizon)]
  const unit = commodity.unit === 'dozen' ? t('common.perdz') : t('common.perkg')
  return (
    <button className={'tag ' + hz.signal} onClick={onOpen} style={{ '--i': index }} aria-label={`${commodity.name}, ${peso(item.price)}, ${t('sig.' + hz.signal)} ${pct(hz.change_pct)}`}>
      <span className="tag-hole" aria-hidden="true" />
      <span className="tag-head">
        <span className="tag-icon" aria-hidden="true">{commodity.icon}</span>
        <span className="tag-name">{commodity.short}<small>{lang === 'fil' ? commodity.name : commodity.fil}</small></span>
      </span>
      <span className="tag-price">{peso(item.price)}<small>{unit}</small></span>
      <Sparkline values={item.spark} forecast={item.spark_forecast} width={150} height={38} />
      <span className="tag-foot">
        <SignalChip signal={hz.signal}>{t('sig.' + hz.signal + '.short')} {pct(hz.change_pct)}</SignalChip>
        <span className="tag-hz">{horizon}d</span>
      </span>
    </button>
  )
}
