import { describe, expect, test } from 'vitest';
import type { PortfolioItem } from '@loanwick/contracts/domain';
import { FixtureAdapter } from '../src/adapters/fixture';
import { formatPortfolioMoney, summarizePortfolio } from '../src/portfolio';

function portfolio(adapter = new FixtureAdapter()) {
  let items: PortfolioItem[] = [];
  adapter.subscribePortfolio(value => { items = value; }, error => { throw new Error(error.message); })();
  return items;
}

describe('authorized portfolio summaries', () => {
  test('summarizes the canonical fixture without rounding stored amounts', () => {
    const summary = summarizePortfolio(portfolio());
    expect(summary).toMatchObject({ count: 18, investigated: 0, openConcerns: 4, flaggedApplications: 4, releaseReady: 0, released: 0 });
    expect(summary.currencies).toEqual([{ currency: 'USD', totalCents: 481_775_000, maxCents: 79_140_000 }]);
    expect(summary.stages).toEqual([{ stage: 'submitted', count: 10 }, { stage: 'reviewing', count: 8 }]);
    expect(formatPortfolioMoney(198_000_000, 'USD', true)).toBe('$2M');
    expect(formatPortfolioMoney(198_000_000, 'USD')).toBe('$1,980,000');
  });

  test('keeps currency totals and comparison maxima separate and distinguishes stages from investigations', () => {
    const base = portfolio()[0]!;
    const items: PortfolioItem[] = [
      { ...base, application: { ...base.application, amountCents: 12345, currency: 'USD', stage: 'ready_for_release' }, openFindingCount: 2, lastInvestigationStatus: 'succeeded' },
      { ...base, application: { ...base.application, amountCents: 10000, currency: 'USD', stage: 'released_demo' }, openFindingCount: 0, lastInvestigationStatus: 'failed' },
      { ...base, application: { ...base.application, amountCents: 90000, currency: 'EUR', stage: 'clarification_needed' }, openFindingCount: 3, lastInvestigationStatus: 'running' },
    ];
    const summary = summarizePortfolio(items);
    expect(summary).toMatchObject({ count: 3, investigated: 1, openConcerns: 5, flaggedApplications: 2, releaseReady: 1, released: 1 });
    expect(summary.currencies).toEqual([
      { currency: 'EUR', totalCents: 90000, maxCents: 90000 },
      { currency: 'USD', totalCents: 22345, maxCents: 12345 },
    ]);
    expect(summary.stages).toEqual([{ stage: 'clarification_needed', count: 1 }, { stage: 'ready_for_release', count: 1 }, { stage: 'released_demo', count: 1 }]);
    expect(formatPortfolioMoney(22345, 'USD')).toBe('$223.45');
  });

  test('handles an empty portfolio and recomputes on subscription updates', async () => {
    expect(summarizePortfolio([])).toEqual({ count: 0, investigated: 0, openConcerns: 0, flaggedApplications: 0, releaseReady: 0, released: 0, currencies: [], stages: [] });
    const adapter = new FixtureAdapter();
    const investigated: number[] = [];
    const unsubscribe = adapter.subscribePortfolio(items => investigated.push(summarizePortfolio(items).investigated), error => { throw new Error(error.message); });
    const result = await adapter.requestInvestigation({ applicationId: 'app-excavator-a', executionMode: 'fixture', correlationId: crypto.randomUUID() });
    expect(result.ok).toBe(true);
    expect(investigated[0]).toBe(0);
    expect(investigated.at(-1)).toBe(1);
    unsubscribe();
  });
});
