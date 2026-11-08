import { APPLICATION_STAGES } from '@loanwick/contracts/domain';
import type { PortfolioItem } from '@loanwick/contracts/domain';

export function summarizePortfolio(items: readonly PortfolioItem[]) {
  const amounts = new Map<string, { totalCents: number; maxCents: number }>();
  for (const { application } of items) {
    const current = amounts.get(application.currency) ?? { totalCents: 0, maxCents: 0 };
    current.totalCents += application.amountCents;
    current.maxCents = Math.max(current.maxCents, application.amountCents);
    amounts.set(application.currency, current);
  }
  return {
    count: items.length,
    investigated: items.filter(item => item.lastInvestigationStatus === 'succeeded').length,
    openConcerns: items.reduce((count, item) => count + item.openFindingCount, 0),
    flaggedApplications: items.filter(item => item.openFindingCount > 0).length,
    releaseReady: items.filter(item => item.application.stage === 'ready_for_release').length,
    released: items.filter(item => item.application.stage === 'released_demo').length,
    currencies: [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, values]) => ({ currency, ...values })),
    stages: APPLICATION_STAGES.map(stage => ({ stage, count: items.filter(item => item.application.stage === stage).length })).filter(item => item.count > 0),
  };
}

export function formatPortfolioMoney(cents: number, currency: string, compact = false) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    ...(compact ? { notation: 'compact' as const, maximumFractionDigits: 0 } : { maximumFractionDigits: cents % 100 ? 2 : 0 }),
  }).format(cents / 100);
}
