import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { DocumentMetadata, Evidence, PortfolioItem, PresentedFinding, StaffCaseView, ToolEvent } from '@loanwick/contracts/domain';
import { Icon } from './components/Icon';
import { WorkspaceShell } from './components/WorkspaceShell';
import { correlationId, readable } from './adapters/types';
import type { FrontendAdapter, SessionState } from './adapters/types';
import { inspectContractFile } from './adapters/contract-file';
import type { ContractFile } from './adapters/contract-file';
import styles from './ContractVerification.module.css';
import motion from './motion.module.css';
import contractFolio from './assets/contract-folio.webp';
import engravedBanknote from './assets/engraved-banknote.webp';

type Message = { id: string; text: string; state: 'done' | 'working' | 'attention'; detail?: string | undefined };
type CaseNames = {
  application: Pick<StaffCaseView['application'], 'id' | 'businessName'>;
  relatedApplications?: Array<Pick<StaffCaseView['application'], 'id' | 'businessName'>> | undefined;
};
type ResultFinding = Pick<PresentedFinding, 'id' | 'findingType' | 'applicationIds' | 'facts' | 'title' | 'explanation' | 'uncertainty' | 'suggestedNextStep' | 'evidenceIds'>;
type ResultDocument = Pick<DocumentMetadata, 'id' | 'displayFilename'>;
type ServiceCase = CaseNames & { evidence: Evidence[]; documents: ResultDocument[] };
type ServiceResult = { model: string; summary: string | null; comparedCount: number | null; findings: ResultFinding[]; view: ServiceCase | null };
type ServiceResponse = {
  message?: string; model?: string; assistantSummary?: string | null;
  extracted?: { businessName?: string | null; identifier?: string | null };
  comparedWith?: unknown[];
  findings?: Array<ResultFinding & { relatedBusinessNames?: string[] }>;
  case?: ServiceCase;
};
const sizes = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const wait = (ms: number) => new Promise<void>(resolve => { window.setTimeout(resolve, ms); });

const VERIFICATION_STAGES: ReadonlyArray<{
  id: string;
  workingText: string;
  workingDetail: string;
  doneText: string;
  doneDetail: string;
  durationMs: number;
}> = [
  {
    id: 'stage-percolate',
    workingText: 'Percolating — reading contract pages and borrower details…',
    workingDetail: 'Scanning borrower information, loan amount, and listed equipment',
    doneText: 'Read contract pages and borrower details.',
    doneDetail: 'Borrower information, loan amount, and listed equipment identified',
    durationMs: 650,
  },
  {
    id: 'stage-calculate',
    workingText: 'Calculating — comparing equipment IDs and ownership claims…',
    workingDetail: 'Checking whether listed equipment is claimed on other loan applications',
    doneText: 'Compared equipment IDs and ownership claims across applications.',
    doneDetail: 'Checked active applications for duplicate sole-ownership claims',
    durationMs: 650,
  },
  {
    id: 'stage-exposure',
    workingText: 'Evaluating — calculating connected borrower totals and limits…',
    workingDetail: 'Comparing combined loan requests against bank review limits',
    doneText: 'Calculated connected borrower totals and policy limits.',
    doneDetail: 'Checked combined loan amounts against standard review thresholds',
    durationMs: 650,
  },
  {
    id: 'stage-synthesize',
    workingText: 'Synthesizing — preparing plain-language results and evidence…',
    workingDetail: 'Organizing items that need your review',
    doneText: 'Prepared plain-language verification summary.',
    doneDetail: 'Supporting document records linked for review',
    durationMs: 550,
  },
];

// One decorative asset at different focal depths; never part of the evidence.
function BanknoteMargins() {
  return <div className={styles.banknoteMargins} aria-hidden="true">{Array.from({ length: 6 }, (_, index) =>
    <img key={index} src={engravedBanknote} alt="" width={1000} height={454} className={styles.banknote} />,
  )}</div>;
}

function friendlyToolSummary(event: ToolEvent): { text: string; detail?: string } {
  const summary = event.safeOutputSummary || '';
  const match = summary.match(/^(\d+)\s+supported concerns?;\s*(\d+)\s+assets?\s+lacks?\s+usable identifiers\./i);
  if (match) {
    const concerns = Number(match[1]);
    const skipped = Number(match[2]);
    const text = concerns === 0
      ? 'No overlapping claims or policy issues were found.'
      : `Found ${concerns} item${concerns === 1 ? '' : 's'} that need${concerns === 1 ? 's' : ''} your review.`;
    const skippedText = skipped > 0
      ? `${skipped} other equipment listing${skipped === 1 ? ' was' : 's were'} skipped because ${skipped === 1 ? 'it was' : 'they were'} missing an equipment ID number. `
      : '';
    return {
      text,
      detail: `${skippedText}This check highlights records to review and is not a loan approval.`,
    };
  }
  return {
    text: (summary || readable(event.toolName)).replace('1 supported concerns', '1 supported concern').replace('1 assets lack', '1 asset lacks'),
  };
}

const joinNames = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');

function friendlyFinding(finding: ResultFinding, view: CaseNames | null) {
  const appNames = finding.applicationIds
    .map(id => id === view?.application.id ? view.application.businessName : view?.relatedApplications?.find(a => a.id === id)?.businessName)
    .filter((name): name is string => Boolean(name));
  const equipmentId = finding.facts?.normalizedIdentifier;

  if (finding.findingType === 'collateral_conflict') {
    const equipmentLabel = equipmentId ? `Equipment ${equipmentId}` : 'The same piece of equipment';
    const where = appNames.length >= 2
      ? `${finding.applicationIds.length} separate loan applications (${joinNames(appNames)})`
      : `${finding.applicationIds.length} separate loan applications`;
    return {
      title: equipmentId
        ? `Same equipment (${equipmentId}) is claimed as 100% owned on ${finding.applicationIds.length} applications`
        : 'Two applications claim sole ownership of the same equipment',
      explanation: `${equipmentLabel} is listed as solely owned (100% owned by the borrower) on ${where}. Two different borrowers cannot both be the sole owner of the same piece of equipment at the same time.`,
      whyItMatters: 'Why this happens: This is not proof of fraud — it often happens because of a typo in the equipment ID number, an outdated equipment list, or a recent sale between businesses.',
      nextStep: 'Ask the applicant for proof of ownership (such as a bill of sale or title) or an updated equipment list.',
    };
  }

  if (finding.findingType === 'collateral_ownership_unknown') {
    const equipmentLabel = equipmentId ? `Equipment ${equipmentId}` : 'This piece of equipment';
    return {
      title: equipmentId
        ? `Equipment (${equipmentId}) is listed on multiple applications without proof of ownership`
        : 'Shared equipment is missing proof of ownership',
      explanation: `${equipmentLabel} appears on more than one loan application, and the submitted documents do not clearly state who owns it.`,
      whyItMatters: 'Why this happens: The equipment may be leased, shared between partner businesses, or missing its ownership paperwork.',
      nextStep: 'Ask the applicant for a current ownership document and an updated equipment list.',
    };
  }

  if (finding.findingType === 'group_review_required') {
    const total = typeof finding.facts?.totalCents === 'number' && finding.facts?.currency
      ? money(finding.facts.totalCents, finding.facts.currency)
      : 'the combined total';
    const limit = typeof finding.facts?.thresholdCents === 'number' && finding.facts?.currency
      ? money(finding.facts.thresholdCents, finding.facts.currency)
      : 'the review limit';
    const where = appNames.length >= 2 ? ` (${joinNames(appNames)})` : '';
    return {
      title: `Connected borrowers exceed the ${limit} combined loan review limit`,
      explanation: `${finding.applicationIds.length} connected loan applications${where} request a combined total of ${total}, which is above the ${limit} limit that requires a group review.`,
      whyItMatters: 'Why this happens: Connected businesses are reviewed together when their combined loan requests pass the bank’s standard review threshold. This is a routine policy check, not a sign of wrongdoing.',
      nextStep: 'Have an authorized loan reviewer check the connected applications together.',
    };
  }

  return {
    title: finding.title,
    explanation: finding.explanation,
    whyItMatters: finding.uncertainty,
    nextStep: finding.suggestedNextStep,
  };
}

function friendlyLocation(locator: string | null, pageNumber: number | null): string {
  const line = locator?.match(/^(?:page \d+ )?line (\d+)$/i)?.[1];
  if (pageNumber) return line ? `Page ${pageNumber} · Line ${line}` : `Page ${pageNumber}`;
  if (line) return `Line ${line}`;
  if (!locator) return 'Document record';
  const map: Record<string, string> = {
    '$.collateral.identifier': 'Equipment schedule · Equipment ID',
    '$.collateral.exclusiveOwnershipClaim': 'Equipment schedule · Ownership declaration',
    '$.activeCollateralClaim': 'Equipment schedule · Collateral status',
    '$.amountCents': 'Loan terms · Requested amount',
    '$.currency': 'Loan terms · Currency',
    '$.confirmedGroup': 'Borrower profile · Connected business group',
    '$.address': 'Borrower profile · Business address',
    '$.syntheticRegistrationId': 'Borrower profile · Business registration',
    '$.syntheticAccountToken': 'Payment instructions · Account',
  };
  if (map[locator]) return map[locator]!;
  if (locator.startsWith('$.')) {
    return readable(locator.slice(2).replaceAll('.', ' '));
  }
  return locator;
}

function friendlyEvidence(evidence: Evidence, source: ResultDocument | undefined, view: CaseNames | null) {
  const isOwnApp = evidence.applicationId === view?.application.id;
  const appName = isOwnApp
    ? `${view.application.businessName} (this application)`
    : view?.relatedApplications?.find(a => a.id === evidence.applicationId)?.businessName
      ? `${view.relatedApplications.find(a => a.id === evidence.applicationId)!.businessName} (other application)`
      : 'Related application';

  let label = 'Recorded detail';
  let value = evidence.extractedValue ?? evidence.excerpt;

  if (evidence.fieldName === 'identifier') {
    label = 'Equipment ID listed';
    if (!evidence.extractedValue) {
      value = 'No equipment ID provided';
    } else if (evidence.extractedValue !== evidence.extractedValue.toUpperCase()) {
      value = `${evidence.extractedValue} (same ID as ${evidence.extractedValue.toUpperCase()})`;
    } else {
      value = evidence.extractedValue;
    }
  } else if (evidence.fieldName === 'exclusiveOwnershipClaim') {
    label = 'Ownership claim';
    if (evidence.extractedValue === 'true') {
      value = 'Sole owner — borrower states they own 100% of this equipment';
    } else if (evidence.extractedValue === 'false') {
      value = 'Shared or leased — borrower does not claim sole ownership';
    } else {
      value = 'Ownership not stated in the submitted document';
    }
  } else if (evidence.fieldName === 'activeCollateralClaim') {
    label = 'Collateral status';
    value = evidence.extractedValue === 'false'
      ? 'Removed from the borrower’s pledged equipment list'
      : 'Actively pledged as collateral for this loan';
  } else if (evidence.fieldName === 'amountCents') {
    label = 'Requested loan amount';
    const cents = Number(evidence.extractedValue);
    value = Number.isFinite(cents) ? money(cents, 'USD') : (evidence.extractedValue ?? '');
  } else if (evidence.fieldName === 'currency') {
    label = 'Loan currency';
    value = evidence.extractedValue === 'USD' ? 'US Dollars (USD)' : (evidence.extractedValue ?? '');
  } else if (evidence.fieldName === 'confirmedGroup') {
    label = 'Connected business group';
    value = (evidence.extractedValue ?? '').replace(/^SYNTH-/, '').replaceAll('-', ' ');
  } else if (evidence.fieldName === 'syntheticAccountToken') {
    label = 'Payout account reference';
    value = evidence.extractedValue ?? '';
  } else if (evidence.fieldName === 'address') {
    label = 'Business address';
    value = evidence.extractedValue ?? '';
  } else if (evidence.fieldName === 'syntheticRegistrationId') {
    label = 'Business registration ID';
    value = evidence.extractedValue ?? '';
  } else if (evidence.fieldName) {
    label = readable(evidence.fieldName);
    value = evidence.extractedValue ?? evidence.excerpt.replace(/^"[^"]+":\s*/, '').replace(/^"|"$/g, '');
  }

  const location = friendlyLocation(evidence.locator, evidence.pageNumber);
  const filename = source?.displayFilename ?? 'Stored document';
  const citation = `${appName} · ${filename} · Version ${evidence.documentVersion} · ${location}`;

  return { label, value, citation };
}

function FindingDetails({ finding, view, evidence, documents }: { finding: ResultFinding; view: CaseNames | null; evidence: readonly Evidence[]; documents: readonly ResultDocument[] }) {
  const info = friendlyFinding(finding, view);
  const cited = finding.evidenceIds.flatMap(id => evidence.filter(entry => entry.id === id));
  const ordered = [...cited.filter(item => item.applicationId === view?.application.id), ...cited.filter(item => item.applicationId !== view?.application.id)];
  return <details><summary>{info.title}</summary><p>{info.explanation}</p><p className={styles.muted}>{info.whyItMatters}</p><p className={styles.nextStep}><strong>Suggested next step:</strong> {info.nextStep}</p>{ordered.map(item => { const id = item.id; const shown = friendlyEvidence(item, documents.find(entry => entry.id === item.documentId), view); return <blockquote key={id}><p><strong>{shown.label}:</strong> {shown.value}</p><cite>{shown.citation}</cite></blockquote>; })}</details>;
}

const toServiceResult = (body: ServiceResponse): ServiceResult => ({
  model: body.model ?? 'verification service',
  summary: body.assistantSummary ?? null,
  comparedCount: body.comparedWith?.length ?? null,
  findings: body.findings ?? [],
  view: body.case ?? null,
});

// The model writes light markdown; show its bullets as paragraphs and its bold runs as bold.
function SummaryText({ text }: { text: string }) {
  const blocks = text.replace(/【[^】]*】/g, '').split(/\s+-\s+|\s+(?=\*\*[^*]+\*\*\s+-\s)/).map(block => block.trim()).filter(Boolean);
  return <>{blocks.map((block, index) => <p key={index}>{block.split(/\*\*(.+?)\*\*/g).map((part, at) => at % 2 ? <strong key={at}>{part}</strong> : part.replaceAll('*', ''))}</p>)}</>;
}

export function ContractVerification({ adapter, session }: { adapter: FrontendAdapter; session: SessionState }) {
  const [applications, setApplications] = useState<PortfolioItem[]>([]);
  const [applicationId, setApplicationId] = useState('');
  const [view, setView] = useState<StaffCaseView | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<ContractFile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serviceResult, setServiceResult] = useState<ServiceResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hasEnteredDesk, setHasEnteredDesk] = useState(false);
  const deskHeading = useRef<HTMLHeadingElement>(null);
  const [uri, setUri] = useState(import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://127.0.0.1:4310');
  const [database, setDatabase] = useState(import.meta.env.VITE_SPACETIMEDB_DATABASE ?? '');
  const [token, setToken] = useState('');
  const generation = useRef(0); const requestedDocument = useRef<string | null>(null); const fileInput = useRef<HTMLInputElement>(null); const menu = useRef<HTMLDetailsElement>(null);
  const connected = session.status === 'connected' && session.user?.role === 'officer';
  const canConnect = adapter.mode === 'live' && typeof adapter.connect === 'function';
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector<HTMLElement>('summary')?.focus(); } };
    window.document.addEventListener('pointerdown', outside); window.document.addEventListener('keydown', escape);
    return () => { window.document.removeEventListener('pointerdown', outside); window.document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    generation.current++; setToken(''); setApplications([]); setApplicationId(''); setView(null); setFile(null); setFileInfo(null); setMessages([]); setJobId(null); setDocumentId(null); setSample(false); setBusy(false); setError(''); setServiceResult(null); setHasEnteredDesk(false);
    if (!connected) return;
    return adapter.subscribePortfolio(items => { setApplications(items); setApplicationId(current => items.some(i => i.application.id === current) ? current : session.defaultApplicationId && items.some(i => i.application.id === session.defaultApplicationId) ? session.defaultApplicationId : items[0]?.application.id ?? ''); }, value => { setApplications([]); setError(value.message); });
  }, [adapter, connected, session.user?.id, session.defaultApplicationId]);
  useEffect(() => {
    setView(null); if (!connected || !applicationId) return;
    return adapter.subscribeCase(applicationId, setView, value => { setView(null); setError(value.message); });
  }, [adapter, connected, applicationId]);
  const job = view?.investigations.find(item => item.id === jobId);
  const document = view?.documents.find(item => item.id === documentId);
  const currentFindings = view?.findings.filter(item => item.investigationJobId === jobId) ?? [];
  const running = busy || job?.status === 'queued' || job?.status === 'running' || (!!documentId && !jobId && document?.extractionStatus === 'pending');
  const failed = !!error || job?.status === 'failed' || job?.status === 'cancelled' || document?.extractionStatus === 'failed' || document?.extractionStatus === 'unsupported';
  const complete = job?.status === 'succeeded' || serviceResult !== null;
  const heading = complete ? 'Verification complete' : failed ? 'Verification needs attention' : running ? 'Verifying your contract' : messages.length ? 'Waiting for contract upload' : 'Verify a loan contract';
  const selectedLoanName = applications.find(item => item.application.id === applicationId)?.application.businessName ?? 'Loan application';
  const shortLoanName = selectedLoanName.split(/\s+/).slice(0, 2).join(' ');
  const coverActive = !hasEnteredDesk && connected && !file && !messages.length && !jobId && !documentId && !running && !failed && !complete;
  const workingStage = VERIFICATION_STAGES.findIndex(stage => messages.some(message => message.id === stage.id && message.state === 'working'));
  const lastFinishedStage = VERIFICATION_STAGES.reduce((last, stage, index) => messages.some(message => message.id === stage.id && message.state === 'done') ? index : last, -1);
  // Live tools do not expose these four substages: only extraction and the
  // returned summary can be highlighted without inventing intermediate work.
  const activeStage = complete ? 3 : workingStage >= 0 ? workingStage : documentId && document?.extractionStatus !== 'succeeded' ? 0 : -1;
  const stageLabels = ['Reading pages', 'Equipment claims', 'Borrower limits', 'Evidence summary'];
  function enterDesk(focusHeading = true) {
    setHasEnteredDesk(true);
    if (focusHeading) window.requestAnimationFrame(() => {
      deskHeading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  async function startInvestigation(isSample: boolean, activeGeneration: number) {
    const result = await adapter.requestInvestigation({ applicationId, executionMode: isSample ? 'fixture' : 'live', correlationId: correlationId() });
    if (generation.current !== activeGeneration) return;
    if (!result.ok) throw new Error(result.error.message);
    setJobId(result.value.jobId);
  }
  async function runStagedVerification(activeGeneration: number) {
    for (const stage of VERIFICATION_STAGES) {
      if (generation.current !== activeGeneration) return false;
      setMessages(current => [
        ...current.filter(item => item.id !== stage.id),
        { id: stage.id, text: stage.workingText, detail: stage.workingDetail, state: 'working' },
      ]);
      await wait(stage.durationMs);
      if (generation.current !== activeGeneration) return false;
      setMessages(current => current.map(item =>
        item.id === stage.id
          ? { id: stage.id, text: stage.doneText, detail: stage.doneDetail, state: 'done' }
          : item,
      ));
    }
    return generation.current === activeGeneration;
  }
  useEffect(() => {
    if (!documentId || !document || jobId || requestedDocument.current === documentId || document.extractionStatus !== 'succeeded') return;
    requestedDocument.current = documentId; const activeGeneration = generation.current; setBusy(true);
    void startInvestigation(false, activeGeneration).catch(value => { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'Verification could not start.'); }).finally(() => { if (generation.current === activeGeneration) setBusy(false); });
  }, [documentId, document?.extractionStatus, jobId]);

  function reset() {
    generation.current++; requestedDocument.current = null; setFile(null); setFileInfo(null); setMessages([]); setJobId(null); setDocumentId(null); setSample(false); setError(''); setBusy(false); setServiceResult(null); if (fileInput.current) fileInput.current.value = '';
  }
  function choose(selected: File | undefined) {
    if (!selected || running) return;
    enterDesk(false); reset(); setFile(selected);
  }
  async function verify() {
    if (!file || !applicationId || running) return;
    enterDesk(false);
    const activeGeneration = ++generation.current; setBusy(true); setError(''); setMessages([{ id: 'file', text: 'Checking the selected file…', state: 'working' }]);
    try {
      const info = await inspectContractFile(file); if (generation.current !== activeGeneration) return;
      setFileInfo(info); setMessages([{ id: 'file', text: `${info.format} selected: ${info.name}`, detail: `${sizes(info.size)} · File format checked`, state: 'done' }]);
      if (adapter.mode === 'fixture' && import.meta.env.PROD) {
        setMessages(current => [...current, { id: 'intake', text: 'Reading the contract and comparing it with loans on file.', detail: 'This usually takes under a minute.', state: 'working' }]);
        const response = await fetch('/api/investigate', { method: 'POST', headers: { 'content-type': file.type || 'application/pdf', 'x-filename': encodeURIComponent(file.name) }, body: file });
        const body = await response.json() as ServiceResponse;
        if (generation.current !== activeGeneration) return;
        if (!response.ok) throw new Error(body.message ?? 'The verification service did not finish.');
        const finding = body.findings?.[0];
        const related = joinNames(finding?.relatedBusinessNames ?? []);
        const read = [body.extracted?.businessName, body.extracted?.identifier && `serial ${body.extracted.identifier}`].filter(Boolean).join(' · ');
        setServiceResult(toServiceResult(body));
        setMessages(current => [...current.filter(item => item.id !== 'intake'), { id: 'intake', text: 'Contract read.', detail: read || undefined, state: 'done' }, { id: 'compare', text: `Compared with ${body.comparedWith?.length ?? 0} loans on file.`, state: 'done' }, { id: 'finding', text: finding ? friendlyFinding(finding, body.case ?? null).title : 'No other loan on file claims this equipment', detail: related ? `Also claimed by ${related}` : undefined, state: finding ? 'attention' : 'done' }]);
        return;
      }
      if (adapter.mode === 'fixture') {
        const finishedStages = await runStagedVerification(activeGeneration);
        if (!finishedStages) return;
        await startInvestigation(true, activeGeneration);
        return;
      }
      if (!adapter.uploadContract) {
        setMessages(current => [...current, { id: 'intake', text: 'The contract upload service is not connected yet.', detail: 'Your file has not been uploaded. Please contact your support team to connect the upload service.', state: 'attention' }]);
        return;
      }
      setMessages(current => [...current, { id: 'intake', text: 'Uploading the contract securely.', state: 'working' }]);
      const id = await adapter.uploadContract(applicationId, file); if (generation.current !== activeGeneration) return;
      setMessages(current => current.map(item => item.id === 'intake' ? { id: 'intake', text: 'Your contract has been received.', state: 'done' } : item));
      setDocumentId(id);
    } catch (value) { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'The contract could not be received.'); }
    finally { if (generation.current === activeGeneration) setBusy(false); }
  }
  async function runSample() {
    if (!applicationId || running) return; enterDesk(false); reset(); const activeGeneration = ++generation.current; setSample(true); setBusy(true);
    if (import.meta.env.PROD) {
      setMessages([{ id: 'sample', text: 'Asking the verification service.', detail: 'Sample documents only. Your selected contract is not used.', state: 'working' }]);
      try {
        const response = await fetch('/api/investigate', { method: 'POST' });
        const body = await response.json() as ServiceResponse;
        if (generation.current !== activeGeneration) return;
        if (!response.ok) throw new Error(body.message ?? 'The verification service did not finish.');
        const finding = body.findings?.[0];
        const related = joinNames(finding?.relatedBusinessNames ?? []);
        setServiceResult(toServiceResult(body));
        setMessages([{ id: 'sample', text: 'Verification service finished.', detail: body.model ?? 'verification service', state: 'done' }, { id: 'finding', text: finding ? friendlyFinding(finding, body.case ?? null).title : 'No concern returned', detail: related ? `Also claimed by ${related}` : undefined, state: finding ? 'attention' : 'done' }]);
      } catch (value) { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'The verification service did not finish.'); }
      finally { if (generation.current === activeGeneration) setBusy(false); }
      return;
    }
    setMessages([{ id: 'sample', text: 'Sample verification started.', detail: 'Uses sample documents only. Your selected contract is not used.', state: 'done' }]);
    try {
      const finishedStages = await runStagedVerification(activeGeneration);
      if (!finishedStages) return;
      await startInvestigation(true, activeGeneration);
    }
    catch (value) { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'The sample check could not start.'); }
    finally { if (generation.current === activeGeneration) setBusy(false); }
  }
  const stream: Message[] = [...messages];
  if (documentId) stream.push({ id: 'extract', text: document?.extractionStatus === 'succeeded' ? 'The contract text is ready to check.' : document?.extractionStatus === 'failed' ? 'The contract text could not be read.' : document?.extractionStatus === 'unsupported' ? 'This service cannot read this contract format yet.' : 'Waiting for the contract text to be read.', state: document?.extractionStatus === 'succeeded' ? 'done' : failed ? 'attention' : 'working' });
  if (job) {
    const jobMessage: Message = { id: 'job', text: job.status === 'queued' ? 'Your contract is waiting for verification to start.' : job.status === 'running' ? 'Verification is in progress.' : job.status === 'succeeded' ? 'Verification checks finished.' : job.status === 'cancelled' ? 'Verification was cancelled.' : 'Verification could not finish.', state: job.status === 'queued' || job.status === 'running' ? 'working' : job.status === 'succeeded' ? 'done' : 'attention', detail: `${job.executionMode === 'fixture' ? 'Sample check' : 'Verification service'}${job.errorCode ? ` · ${readable(job.errorCode)}` : ''}` };
    if (job.status === 'queued' || job.status === 'running') stream.push(jobMessage);
    for (const event of (view?.toolEvents ?? []).filter(item => item.investigationJobId === jobId).sort((a, b) => a.sequence - b.sequence)) {
      const summary = friendlyToolSummary(event);
      stream.push({ id: event.id, text: summary.text, detail: summary.detail, state: event.status === 'running' ? 'working' : event.status === 'failed' ? 'attention' : 'done' });
    }
    if (job.status !== 'queued' && job.status !== 'running') stream.push(jobMessage);
  }
  if (error) stream.push({ id: 'error', text: error, state: 'attention' });

  return <div className={`${styles.page} ${coverActive ? styles.coverActive : ''}`}>
    {coverActive && <a className={styles.skip} href="#verification" onClick={() => enterDesk()}>Skip to verification</a>}
    {coverActive && <header className={styles.header}><Link to="/" className={styles.brand}><span aria-hidden="true">W</span>LoanWick</Link><div className={styles.session}><span className={connected ? styles.online : styles.offline} /><span>{connected ? 'Loan officer' : readable(session.status)}</span><details ref={menu} className={styles.menu}><summary><Icon name="menu" size={17} />Menu</summary><div className={styles.menuPanel}><p>{connected ? 'Loan officer · Connected' : readable(session.status)}</p>{connected && <><label>Loan application<select disabled={running || !!documentId || !!jobId} value={applicationId} onChange={event => { reset(); setApplicationId(event.target.value); if (menu.current) menu.current.open = false; }}>{applications.map(item => <option key={item.application.id} value={item.application.id}>{item.application.businessName}</option>)}</select></label><button onClick={() => { adapter.disconnect(); if (menu.current) menu.current.open = false; }}>{adapter.mode === 'fixture' ? 'Pause demo' : 'Sign out'}</button></>}</div></details></div></header>}
    {coverActive && <section className={styles.cover} aria-labelledby="dossier-heading">
      <BanknoteMargins />
      <span className={`${styles.edgeTab} ${styles.coverLeft}`}>{shortLoanName}</span>
      <span className={`${styles.edgeTab} ${styles.coverRight}`}>{adapter.mode === 'fixture' ? 'Sample mode' : 'Connected mode'}</span>
      <div className={styles.coverContent}>
        <p className={styles.dossierLabel}><span>Active dossier</span><span aria-hidden="true">·</span>{selectedLoanName}</p>
        <h2 id="dossier-heading">EVERY LOAN CLAUSE,<br /><span>TRACED TO THE SOURCE.</span></h2>
        <p className={styles.coverSubtitle}>Upload your contract. We’ll guide you through the checks step by step.</p>
        <button className={styles.enterDesk} onClick={() => enterDesk()}>Enter Verification Desk<Icon name="arrow" size={19} /></button>
      </div>
      <ol className={styles.coverRuler}>{['Contract intake', 'Page extraction', 'Ownership claims', 'Borrower limits', 'Evidence summary'].map((label, index) => <li key={label}><span>0{index + 1}</span>{label}</li>)}</ol>
    </section>}
    <WorkspaceShell adapter={adapter} session={session} applicationId={applicationId} chromeVisible={!coverActive} mainId="verification">
    <div className={styles.deskShell}>
    <main id="verification" tabIndex={-1} className={`${styles.main} ${!coverActive ? motion.enter : ''}`} onFocusCapture={event => { if (coverActive && event.target.matches(':focus-visible')) enterDesk(false); }}>
      <div className={styles.title}><h1 ref={deskHeading} tabIndex={-1}>{heading}</h1><p>{complete ? 'Review the returned checks and supporting evidence.' : messages.length ? 'Follow the verification as each stage reports back.' : 'Upload your contract. We’ll guide you through the checks.'}</p></div>
      {connected && !coverActive && <div className={styles.loanToolbar}><label>Loan application<select disabled={running || !!documentId || !!jobId} value={applicationId} onChange={event => { reset(); setApplicationId(event.target.value); }}>{applications.map(item => <option key={item.application.id} value={item.application.id}>{item.application.businessName}</option>)}</select></label><span><Icon name="folder" size={16} />Commercial Facility</span><button onClick={() => adapter.disconnect()}>{adapter.mode === 'fixture' ? 'Pause demo' : 'Sign out'}</button></div>}
      {!connected ? !canConnect ? <section className={styles.connection}><h2>{adapter.mode === 'fixture' ? 'Demo connection paused' : 'Connection unavailable'}</h2><p>{adapter.mode === 'fixture' ? 'Reconnect to continue with the synthetic verification demo.' : session.message ?? 'Retry the authorized connection before continuing.'}</p><button className={styles.primary} onClick={() => adapter.retry()}>Retry connection</button></section> : <section className={styles.connection}><h2>Connect your bank session</h2><p>{session.message ?? 'Use your individually authorized officer session.'}</p><form onSubmit={event => { event.preventDefault(); adapter.connect?.(uri, database, token); }}><label>Database endpoint<input required value={uri} onChange={e => setUri(e.target.value)} /></label><label>Database name<input required value={database} onChange={e => setDatabase(e.target.value)} /></label><label>Individual session token<input required type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label><button className={styles.primary} disabled={session.status === 'connecting'}>Connect authorized session</button></form>{session.status === 'disconnected' && <button onClick={() => adapter.retry()}>Retry connection</button>}</section> : <>
        {!jobId && !documentId && !messages.length && <section className={`${styles.upload} ${dragging ? styles.dragging : ''}`} aria-label="Contract upload" onDragOver={e => { e.preventDefault(); if (!running) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length > 1) { setError('Select one contract at a time.'); return; } choose(e.dataTransfer.files[0]); }}>
          <div className={styles.folioComposition} aria-hidden="true"><img src={contractFolio} width={192} height={128} className={styles.illustration} alt="" /></div><h2>{file ? file.name : 'Drop your loan contract here'}</h2><p>{file ? `${sizes(file.size)} · Ready to check` : 'PDF or Word document · Up to 10 MB'}</p>
          <input ref={fileInput} id="contract-file" tabIndex={-1} aria-label="Loan contract" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={running} onChange={e => choose(e.target.files?.[0])} className={styles.fileInput} />
          <div className={styles.actions}>{file ? <><button className={styles.primary} disabled={running || !applicationId || adapter.contractUploadNeedsReconciliation?.(applicationId)} onClick={() => void verify()}>{busy ? 'Checking file…' : 'Verify contract'}<Icon name="arrow" size={17} /></button><button disabled={running} onClick={() => fileInput.current?.click()}>Choose another file</button></> : <button className={styles.primary} disabled={running || !applicationId} onClick={() => fileInput.current?.click()}>Choose contract<Icon name="arrow" size={17} /></button>}</div>
          {adapter.mode === 'fixture' && <p className={styles.localNote}>{import.meta.env.PROD ? 'Demo workspace. Your PDF is sent to the LoanWick server, read, and compared with the demo loans on file.' : 'Sample workspace. Selected files stay on this device.'}</p>}
        </section>}
        {file && messages.length > 0 && <div className={styles.fileSummary}><Icon name="document" size={22} /><div><strong>{file.name}</strong><small>{fileInfo?.format ?? 'Selected file'} · {sizes(file.size)}</small></div></div>}
        {adapter.contractUploadNeedsReconciliation?.(applicationId) && <div className={styles.reconcile}><p>A previous upload needs confirmation before another file can be sent.</p><button disabled={busy} onClick={() => { setBusy(true); const activeGeneration = generation.current; void adapter.reconcileContractUpload?.(applicationId).then(id => { if (generation.current === activeGeneration) { setDocumentId(id); setError(''); setMessages(current => [...current.filter(item => item.id !== 'intake'), { id: 'intake', text: id ? 'Your contract has been received.' : 'The previous file was not received. You can choose it again.', state: id ? 'done' : 'attention' }]); } }).catch(value => { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'Upload outcome is still unconfirmed.'); }).finally(() => { if (generation.current === activeGeneration) setBusy(false); }); }}>Check previous upload</button></div>}
        {stream.length > 0 && <section className={styles.pipeline} aria-label="Verification progress"><div className={styles.pipelineHeading}><h2>Verification updates</h2><span>{sample ? 'Sample run' : adapter.mode === 'live' ? 'Connected workspace' : 'Sample workspace'}</span></div><div role="log" aria-live="polite" aria-relevant="additions text" aria-label="Verification messages"><ol className={styles.messages}>{stream.map(item => <li key={item.id}><span className={`${styles.messageIcon} ${styles[item.state]}`}><Icon name={item.state === 'done' ? 'check' : item.state === 'attention' ? 'alert' : 'clock'} size={17} /></span><div><p>{item.text}</p>{item.detail && <small>{item.detail}</small>}</div></li>)}</ol></div></section>}
        {serviceResult && <section className={styles.result}><div><Icon name={serviceResult.findings.length ? 'alert' : 'check'} size={22} /><h2>{serviceResult.findings.length ? `${serviceResult.findings.length} item${serviceResult.findings.length === 1 ? ' needs' : 's need'} review` : 'No concerns returned by these checks'}</h2></div><p>{serviceResult.comparedCount !== null ? `Compared with ${serviceResult.comparedCount} loans on file. ` : ''}Review the supporting evidence before making a decision. Verification does not approve a loan.</p>{serviceResult.findings.map(finding => <FindingDetails key={finding.id} finding={finding} view={serviceResult.view} evidence={serviceResult.view?.evidence ?? []} documents={serviceResult.view?.documents ?? []} />)}{serviceResult.summary && <details><summary>AI explanation</summary><SummaryText text={serviceResult.summary} /></details>}</section>}
        {complete && !serviceResult && <section className={styles.result}><div><Icon name={currentFindings.length ? 'alert' : 'check'} size={22} /><h2>{currentFindings.length ? `${currentFindings.length} item${currentFindings.length === 1 ? ' needs' : 's need'} review` : 'No concerns returned by these checks'}</h2></div><p>{sample ? 'These are results from the synthetic sample case.' : 'Review the supporting evidence before making a decision.'} Verification does not approve a loan.</p>{currentFindings.map(finding => <FindingDetails key={finding.id} finding={finding} view={view} evidence={view?.evidence ?? []} documents={view?.documents ?? []} />)}</section>}
        {(complete || failed || (messages.length > 0 && !running)) && <button className={styles.newRun} disabled={running} onClick={reset}>New verification</button>}
        {adapter.mode === 'fixture' && !running && !jobId && !messages.length && <div className={styles.sample}><button disabled={!applicationId} onClick={() => void runSample()}>Try a sample verification<Icon name="arrow" size={15} /></button><span>Sample documents · No client data</span></div>}
      </>}
      <ol className={styles.stageRuler} aria-label="Verification stages">{stageLabels.map((label, index) => <li key={label} aria-current={activeStage === index ? 'step' : undefined} className={`${activeStage === index ? styles.activeStage : ''} ${complete || index <= lastFinishedStage ? styles.finishedStage : ''}`}><span aria-hidden="true">0{index + 1}</span>{label}</li>)}</ol>
      <footer className={styles.footer}><span><Icon name="shield" size={15} />Synthetic prototype · No money moves</span><span>{adapter.mode === 'live' ? 'Connected workspace' : 'Sample workspace'}</span>{fileInfo && <details><summary>File details</summary><p>{fileInfo.name} · {fileInfo.format} · {sizes(fileInfo.size)}</p><code>SHA-256 {fileInfo.sha256}</code></details>}</footer>
    </main>
    </div>
    </WorkspaceShell>
  </div>;
}
