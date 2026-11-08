import type { PortfolioItem } from '@loanwick/contracts/domain';
import { summarizePortfolio, formatPortfolioMoney } from '../portfolio';
import { readable } from '../adapters/types';
import { Icon } from './Icon';
import styles from './PortfolioSummary.module.css';
import motion from '../motion.module.css';

export function PortfolioSummary({ items }: { items: PortfolioItem[] | null }) {
  const summary = items ? summarizePortfolio(items) : null;
  return <>
    <section className={`${styles.metrics} ${motion.stagger}`} aria-label="Portfolio summary" aria-busy={!items}>
      <article className={styles.metric} aria-label="Applications summary"><span className={styles.metricIcon}><Icon name="grid" size={18} /></span><div><h2>Applications</h2><p className={styles.value}>{summary?.count ?? <span className={styles.skeleton} />}</p><p className={styles.detail}>{summary ? `${summary.investigated} investigated` : 'Loading applications…'}</p></div></article>
      <article className={styles.metric} aria-label="Total requested summary"><span className={styles.metricIcon}><Icon name="document" size={18} /></span><div><h2>Total requested</h2><div className={styles.value}>{summary ? summary.currencies.length ? summary.currencies.map(total => <span className={styles.currency} key={total.currency} aria-label={`${total.currency} ${formatPortfolioMoney(total.totalCents, total.currency)}`} title={`${total.currency} ${formatPortfolioMoney(total.totalCents, total.currency)}`}>{formatPortfolioMoney(total.totalCents, total.currency, true)}{summary.currencies.length > 1 && <small>{total.currency}</small>}</span>) : '—' : <span className={styles.skeleton} />}</div><p className={styles.detail}>Synthetic loan book</p></div></article>
      <article className={`${styles.metric} ${styles.concerns}`} aria-label="Open concerns summary"><span className={styles.metricIcon}><Icon name="alert" size={19} /></span><div><h2>Open concerns</h2><p className={styles.value}>{summary?.openConcerns ?? <span className={styles.skeleton} />}</p><p className={styles.detail}>{summary ? `${summary.flaggedApplications} application${summary.flaggedApplications === 1 ? '' : 's'} flagged` : 'Loading concerns…'}</p></div></article>
      <article className={styles.metric} aria-label="Release ready summary"><span className={styles.metricIcon}><Icon name="shield" size={19} /></span><div><h2>Release ready<details className={styles.help}><summary aria-label="About release-ready stages"><Icon name="info" size={13} /></summary><p>Applications at the release-ready stage. Final release still requires current server checks.</p></details></h2><p className={styles.value}>{summary?.releaseReady ?? <span className={styles.skeleton} />}</p><p className={styles.detail}>{summary ? `${summary.released} simulated release${summary.released === 1 ? '' : 's'}` : 'Loading stages…'}</p></div></article>
    </section>
    <section className={styles.pipeline} aria-label="Application pipeline" aria-busy={!items}>
      <h2>Pipeline</h2><div className={styles.pipelineContent}>
        <div className={styles.pipelineTrack} aria-hidden="true">{summary?.stages.map(item => <span className={`${motion.grow} ${styles[item.stage]}`} key={item.stage} style={{ flexGrow: item.count }} />)}</div>
        <ul className={styles.legend}>{summary ? summary.stages.length ? summary.stages.map(item => <li key={item.stage}><span className={styles[item.stage]} aria-hidden="true" />{readable(item.stage)} {item.count}</li>) : <li>No applications yet</li> : <li>Loading stages…</li>}</ul>
      </div>
    </section>
  </>;
}
