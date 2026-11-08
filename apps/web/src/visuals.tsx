// Visual layer (prototype). Every visual is derived from data the app already has:
// portfolio items, the finding's cited documents, and the server's readiness checks/reasons. Nothing is invented.
import type { PortfolioItem, PresentedFinding, StaffCaseView } from '@loanwick/contracts/domain';
import { CHECK_TYPES } from '@loanwick/contracts/domain';
import { Icon } from './components/Icon';
import { readable } from './adapters/types';
import v from './visuals.module.css';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: cents >= 100_000_000 ? 'compact' : 'standard', maximumFractionDigits: cents >= 100_000_000 ? 1 : 0 }).format(cents / 100);

/* ---------------------------------------------------------------- Portfolio overview */
const STAGE_ORDER = ['submitted', 'reviewing', 'clarification_needed', 'ready_for_release', 'released_demo'] as const;

export function PortfolioOverview({ items }: { items: PortfolioItem[] }) {
  const currencies = new Set(items.map(i => i.application.currency));
  const total = items.reduce((sum, i) => sum + i.application.amountCents, 0);
  const concerns = items.reduce((sum, i) => sum + i.openFindingCount, 0);
  const flagged = items.filter(i => i.openFindingCount > 0).length;
  const investigated = items.filter(i => i.lastInvestigationStatus).length;
  const ready = items.filter(i => i.application.stage === 'ready_for_release').length;
  const released = items.filter(i => i.application.stage === 'released_demo').length;
  const stages = STAGE_ORDER.map(stage => ({ stage, count: items.filter(i => i.application.stage === stage).length })).filter(s => s.count);
  const tiles = [
    { icon: 'grid', label: 'Applications', value: String(items.length), sub: `${investigated} investigated`, tone: 'neutral' },
    { icon: 'document', label: 'Total requested', value: currencies.size === 1 ? money(total, [...currencies][0]!) : 'Mixed', sub: currencies.size === 1 ? 'Synthetic loan book' : 'Currencies are never summed', tone: 'neutral' },
    { icon: 'alert', label: 'Open concerns', value: String(concerns), sub: `${flagged} ${flagged === 1 ? 'application' : 'applications'} flagged`, tone: concerns ? 'risk' : 'ok' },
    { icon: 'shield', label: 'Release ready', value: String(ready), sub: `${released} simulated releases`, tone: ready ? 'ok' : 'neutral' },
  ] as const;
  return <section className={v.overview} aria-label="Portfolio overview">
    <div className={v.tiles}>{tiles.map((t, i) => <div key={t.label} className={`${v.tile} ${v[`tone_${t.tone}`]}`} style={{ animationDelay: `${i * 70}ms` }}>
      <span className={v.tileIcon}><Icon name={t.icon} size={18} /></span>
      <div><span className={v.tileLabel}>{t.label}</span><strong className={v.tileValue}>{t.value}</strong><small>{t.sub}</small></div>
    </div>)}</div>
    {items.length > 0 && <div className={v.stageBar}>
      <span className={v.stageTitle}>Pipeline</span>
      <div className={v.stageTrack} role="img" aria-label={stages.map(s => `${readable(s.stage)}: ${s.count}`).join(', ')}>
        {stages.map(s => <span key={s.stage} className={`${v.stageSeg} ${v[`stage_${s.stage}`]}`} style={{ flexGrow: s.count }} title={`${readable(s.stage)}: ${s.count}`} />)}
      </div>
      <ul className={v.stageLegend}>{stages.map(s => <li key={s.stage}><span className={`${v.dot} ${v[`stage_${s.stage}`]}`} />{readable(s.stage)} <b>{s.count}</b></li>)}</ul>
    </div>}
  </section>;
}

export function AmountBar({ cents, max }: { cents: number; max: number }) {
  return <span className={v.amountBar} aria-hidden="true"><span style={{ width: `${max ? Math.max(6, (cents / max) * 100) : 0}%` }} /></span>;
}

export function ConcernChip({ count }: { count: number }) {
  return count ? <span className={`${v.chip} ${v.chipRisk}`}><span className={v.pulseDot} />{count} open</span>
    : <span className={`${v.chip} ${v.chipClear}`}><Icon name="check" size={13} />Clear</span>;
}

/* ---------------------------------------------------------------- Cross-deal conflict graph */
export function ConflictGraph({ view, finding }: { view: StaffCaseView; finding: PresentedFinding }) {
  const appIds: string[] = [];
  for (const id of finding.evidenceIds) {
    const doc = view.documents.find(d => d.id === view.evidence.find(e => e.id === id)?.documentId);
    if (doc && !appIds.includes(doc.applicationId)) appIds.push(doc.applicationId);
  }
  appIds.sort((a, b) => (a === view.application.id ? -1 : b === view.application.id ? 1 : 0));
  if (appIds.length < 2) return null;
  const apps = appIds.map(id => id === view.application.id ? view.application : view.relatedApplications?.find(a => a.id === id))
    .map((a, i) => ({ id: appIds[i]!, name: a?.businessName ?? 'Related authorized application', amount: a ? money(a.amountCents, a.currency) : null }));
  const asset = finding.facts?.normalizedIdentifier ?? null;
  const high = finding.severity === 'high' && finding.status !== 'resolved';
  const [self, ...others] = apps;
  const W = 820, H = 248, cx = W / 2, cy = H / 2;
  const leftX = 150, rightX = W - 150;
  const ys = others.map((_, i) => others.length === 1 ? cy : 50 + (i * (H - 100)) / (others.length - 1));
  const label = `${asset ? `Equipment ${asset}` : 'The same evidence'} is claimed by ${apps.map(a => a.name).join(' and ')}.`;
  return <section className={`${v.graph} ${high ? v.graphHigh : v.graphReview}`} aria-label="How the applications connect">
    <div className={v.graphHeading}>
      <div><h3>How these applications connect</h3><p>Each line is a cited claim from the borrower’s own documents.</p></div>
      <span className={v.graphTag}>{high ? 'Conflicting claims' : 'Needs review'}</span>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={v.graphSvg}>
      <defs>
        <radialGradient id="assetGlow"><stop offset="0%" stopColor="currentColor" stopOpacity=".28" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></radialGradient>
      </defs>
      {[{ x: leftX, y: cy }, ...ys.map(y => ({ x: rightX, y }))].map((p, i) => {
        const d = `M ${p.x + (i === 0 ? 92 : -92)} ${p.y} C ${(p.x + cx) / 2} ${p.y}, ${(p.x + cx) / 2} ${cy}, ${cx + (i === 0 ? -62 : 62)} ${cy}`;
        return <g key={i}><path d={d} className={v.edgeBase} /><path d={d} className={v.edgeFlow} style={{ animationDelay: `${i * 0.35}s` }} />
          <text x={(p.x + cx) / 2 + (i === 0 ? 12 : -12)} y={(p.y + cy) / 2 - 22} textAnchor="middle" className={v.edgeLabel}>100% owned</text></g>;
      })}
      <circle cx={cx} cy={cy} r={86} fill="url(#assetGlow)" className={v.glow} />
      <g className={v.assetNode}>
        <rect x={cx - 62} y={cy - 38} width={124} height={76} rx={14} />
        <text x={cx} y={cy - 8} textAnchor="middle" className={v.assetKind}>EQUIPMENT</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className={v.assetId}>{asset ?? 'Shared item'}</text>
      </g>
      {[{ a: self!, x: leftX, y: cy, own: true }, ...others.map((a, i) => ({ a, x: rightX, y: ys[i]!, own: false }))].map(({ a, x, y, own }) =>
        <g key={a.id} className={`${v.appNode} ${own ? v.appSelf : ''}`}>
          <rect x={x - 92} y={y - 34} width={184} height={68} rx={10} />
          <text x={x} y={y - 9} textAnchor="middle" className={v.appRole}>{own ? 'THIS APPLICATION' : 'RELATED APPLICATION'}</text>
          <text x={x} y={y + 10} textAnchor="middle" className={v.appName}>{a.name.length > 24 ? `${a.name.slice(0, 23)}…` : a.name}</text>
          {a.amount && <text x={x} y={y + 26} textAnchor="middle" className={v.appAmount}>{a.amount} requested</text>}
        </g>)}
    </svg>
    <p className={v.graphNote}><Icon name="shield" size={15} />Two exclusive claims on one asset can’t both be true. That calls for investigation; it is not a fraud verdict.</p>
  </section>;
}

/* ---------------------------------------------------------------- Release gate */
type GateState = 'ok' | 'todo' | 'warn' | 'blocked' | 'working';
const CHECK_SHORT: Record<string, string> = { collateral_review: 'Collateral', document_consistency_review: 'Documents', payment_verification: 'Payment' };

export function ReleaseGate({ view }: { view: StaffCaseView }) {
  const codes = new Set(view.readiness.reasons.map(r => r.code));
  const released = !!view.release;
  const checkState = (status: string): GateState => status === 'current' ? 'ok' : status === 'pending' ? 'todo' : 'warn';
  const segments: Array<{ label: string; state: GateState; detail: string }> = [
    ...CHECK_TYPES.map(t => ({ label: CHECK_SHORT[t]!, state: released ? 'ok' as GateState : checkState(view.readiness.checks[t].status), detail: readable(view.readiness.checks[t].status) })),
    { label: 'Investigation', state: released ? 'ok' : codes.has('INVESTIGATION_PENDING') ? 'working' : codes.has('INVESTIGATION_STALE') ? 'warn' : codes.has('INVESTIGATION_MISSING') ? 'todo' : 'ok',
      detail: codes.has('INVESTIGATION_PENDING') ? 'Running' : codes.has('INVESTIGATION_STALE') ? 'Out of date' : codes.has('INVESTIGATION_MISSING') ? 'Not run' : 'Current' },
    { label: 'Concerns', state: released ? 'ok' : codes.has('BLOCKING_FINDINGS') ? 'blocked' : codes.has('CLARIFICATION_PENDING') ? 'warn' : 'ok',
      detail: codes.has('BLOCKING_FINDINGS') ? 'Unresolved' : codes.has('CLARIFICATION_PENDING') ? 'Awaiting reply' : 'Clear' },
  ];
  const cleared = segments.filter(s => s.state === 'ok').length;
  const open = released || view.readiness.canRelease || (view.readiness.eligibleByPolicy && cleared === segments.length);
  const icon = (s: GateState) => s === 'ok' ? 'check' : s === 'blocked' || s === 'warn' ? 'alert' : 'clock';
  return <section className={`${v.gate} ${open ? v.gateOpen : ''}`} aria-label={`Release gate: ${cleared} of ${segments.length} conditions met`}>
    <div className={v.gateLock}><Icon name={open ? 'check' : 'shield'} size={20} /><div><strong>{released ? 'Released (simulated)' : open ? 'Gate open' : 'Gate locked'}</strong><small>{cleared} of {segments.length} conditions met</small></div></div>
    <ol className={v.gateTrack}>{segments.map((s, i) =>
      <li key={s.label} className={v[`gate_${s.state}`]} style={{ animationDelay: `${i * 90}ms` }}>
        <span className={v.gateBar}><span /></span>
        <span className={v.gateLabel}><Icon name={icon(s.state)} size={13} />{s.label}</span>
        <small>{s.detail}</small>
      </li>)}</ol>
  </section>;
}

/* ---------------------------------------------------------------- Verification stepper */
export function StageStepper({ steps }: { steps: Array<{ id: string; label: string; state: 'pending' | 'working' | 'done' }> }) {
  const done = steps.filter(s => s.state === 'done').length;
  const working = steps.some(s => s.state === 'working');
  const pct = Math.min(100, ((done + (working ? 0.5 : 0)) / steps.length) * 100);
  return <div className={v.stepper} role="progressbar" aria-label="Verification progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
    <div className={v.stepTrack}><span style={{ width: `${pct}%` }} /></div>
    <ol>{steps.map((s, i) => <li key={s.id} className={v[`step_${s.state}`]}>
      <span className={v.stepDot}>{s.state === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
      <span className={v.stepLabel}>{s.label}</span>
    </li>)}</ol>
  </div>;
}
