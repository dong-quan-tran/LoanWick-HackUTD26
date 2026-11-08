import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { PortfolioItem, StaffCaseView } from '@loanwick/contracts/domain';
import { Icon } from './components/Icon';
import { correlationId, readable } from './adapters/types';
import type { FrontendAdapter, SessionState } from './adapters/types';
import { inspectContractFile } from './adapters/contract-file';
import type { ContractFile } from './adapters/contract-file';
import styles from './ContractVerification.module.css';
import contractFolio from './assets/contract-folio.webp';

type Message = { id: string; text: string; state: 'done' | 'working' | 'attention'; detail?: string };
const sizes = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

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
  const [dragging, setDragging] = useState(false);
  const [uri, setUri] = useState(import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://127.0.0.1:4310');
  const [database, setDatabase] = useState(import.meta.env.VITE_SPACETIMEDB_DATABASE ?? '');
  const [token, setToken] = useState('');
  const generation = useRef(0); const requestedDocument = useRef<string | null>(null); const fileInput = useRef<HTMLInputElement>(null); const menu = useRef<HTMLDetailsElement>(null);
  const connected = session.status === 'connected' && session.user?.role === 'officer';
  const canConnect = adapter.mode === 'live' && typeof adapter.connect === 'function';
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector<HTMLElement>('summary')?.focus(); } };
    window.document.addEventListener('pointerdown', outside); window.document.addEventListener('keydown', escape);
    return () => { window.document.removeEventListener('pointerdown', outside); window.document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    generation.current++; setToken(''); setApplications([]); setApplicationId(''); setView(null); setFile(null); setFileInfo(null); setMessages([]); setJobId(null); setDocumentId(null); setSample(false); setBusy(false); setError('');
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
  const complete = job?.status === 'succeeded';
  const heading = complete ? 'Verification complete' : failed ? 'Verification needs attention' : running ? 'Verifying your contract' : messages.length ? 'Waiting for contract upload' : 'Verify a loan contract';

  async function startInvestigation(isSample: boolean, activeGeneration: number) {
    const result = await adapter.requestInvestigation({ applicationId, executionMode: isSample ? 'fixture' : 'live', correlationId: correlationId() });
    if (generation.current !== activeGeneration) return;
    if (!result.ok) throw new Error(result.error.message);
    setJobId(result.value.jobId);
  }
  useEffect(() => {
    if (!documentId || !document || jobId || requestedDocument.current === documentId || document.extractionStatus !== 'succeeded') return;
    requestedDocument.current = documentId; const activeGeneration = generation.current; setBusy(true);
    void startInvestigation(false, activeGeneration).catch(value => { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'Verification could not start.'); }).finally(() => { if (generation.current === activeGeneration) setBusy(false); });
  }, [documentId, document?.extractionStatus, jobId]);

  function reset() {
    generation.current++; requestedDocument.current = null; setFile(null); setFileInfo(null); setMessages([]); setJobId(null); setDocumentId(null); setSample(false); setError(''); setBusy(false); if (fileInput.current) fileInput.current.value = '';
  }
  function choose(selected: File | undefined) {
    if (!selected || running) return;
    reset(); setFile(selected);
  }
  async function verify() {
    if (!file || !applicationId || running) return;
    const activeGeneration = ++generation.current; setBusy(true); setError(''); setMessages([{ id: 'file', text: 'Checking the selected file.', state: 'working' }]);
    try {
      const info = await inspectContractFile(file); if (generation.current !== activeGeneration) return;
      setFileInfo(info); setMessages([{ id: 'file', text: `${info.format} selected: ${info.name}`, detail: `${sizes(info.size)} · File format checked`, state: 'done' }]);
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
    if (!applicationId || running) return; reset(); const activeGeneration = generation.current; setSample(true); setBusy(true);
    setMessages([{ id: 'sample', text: 'Sample verification started.', detail: 'Uses sample documents only. Your selected contract is not used.', state: 'done' }]);
    try { await startInvestigation(true, activeGeneration); }
    catch (value) { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'The sample check could not start.'); }
    finally { if (generation.current === activeGeneration) setBusy(false); }
  }
  const stream: Message[] = [...messages];
  if (documentId) stream.push({ id: 'extract', text: document?.extractionStatus === 'succeeded' ? 'The contract text is ready to check.' : document?.extractionStatus === 'failed' ? 'The contract text could not be read.' : document?.extractionStatus === 'unsupported' ? 'This service cannot read this contract format yet.' : 'Waiting for the contract text to be read.', state: document?.extractionStatus === 'succeeded' ? 'done' : failed ? 'attention' : 'working' });
  if (job) {
    const jobMessage: Message = { id: 'job', text: job.status === 'queued' ? 'Your contract is waiting for verification to start.' : job.status === 'running' ? 'Verification is in progress.' : job.status === 'succeeded' ? 'Verification checks finished.' : job.status === 'cancelled' ? 'Verification was cancelled.' : 'Verification could not finish.', state: job.status === 'queued' || job.status === 'running' ? 'working' : job.status === 'succeeded' ? 'done' : 'attention', detail: `${job.executionMode === 'fixture' ? 'Sample check' : 'Verification service'}${job.errorCode ? ` · ${readable(job.errorCode)}` : ''}` };
    if (job.status === 'queued' || job.status === 'running') stream.push(jobMessage);
    for (const event of (view?.toolEvents ?? []).filter(item => item.investigationJobId === jobId).sort((a, b) => a.sequence - b.sequence)) stream.push({ id: event.id, text: (event.safeOutputSummary || readable(event.toolName)).replace('1 supported concerns', '1 supported concern').replace('1 assets lack', '1 asset lacks'), state: event.status === 'running' ? 'working' : event.status === 'failed' ? 'attention' : 'done' });
    if (job.status !== 'queued' && job.status !== 'running') stream.push(jobMessage);
  }
  if (error) stream.push({ id: 'error', text: error, state: 'attention' });

  return <div className={styles.page}>
    <a className={styles.skip} href="#verification">Skip to verification</a>
    <header className={styles.header}><Link to="/" className={styles.brand}><span aria-hidden="true">W</span>LoanWick</Link><div className={styles.session}><span className={connected ? styles.online : styles.offline} /><span>{connected ? 'Loan officer' : readable(session.status)}</span><details ref={menu} className={styles.menu}><summary><Icon name="menu" size={17} />Menu</summary><div className={styles.menuPanel}><p>{connected ? 'Loan officer · Connected' : readable(session.status)}</p>{connected && <><label>Loan application<select disabled={running || !!documentId || !!jobId} value={applicationId} onChange={event => { reset(); setApplicationId(event.target.value); if (menu.current) menu.current.open = false; }}>{applications.map(item => <option key={item.application.id} value={item.application.id}>{item.application.businessName}</option>)}</select></label><button onClick={() => { adapter.disconnect(); if (menu.current) menu.current.open = false; }}>{adapter.mode === 'fixture' ? 'Pause demo' : 'Sign out'}</button></>}</div></details></div></header>
    <main id="verification" className={styles.main}>
      <div className={styles.title}><h1>{heading}</h1><p>{complete ? 'Review the returned checks and supporting evidence.' : messages.length ? 'Follow the verification as each stage reports back.' : 'Upload your contract. We’ll guide you through the checks.'}</p></div>
      {!connected ? !canConnect ? <section className={styles.connection}><h2>{adapter.mode === 'fixture' ? 'Demo connection paused' : 'Connection unavailable'}</h2><p>{adapter.mode === 'fixture' ? 'Reconnect to continue with the synthetic verification demo.' : session.message ?? 'Retry the authorized connection before continuing.'}</p><button className={styles.primary} onClick={() => adapter.retry()}>Retry connection</button></section> : <section className={styles.connection}><h2>Connect your bank session</h2><p>{session.message ?? 'Use your individually authorized officer session.'}</p><form onSubmit={event => { event.preventDefault(); adapter.connect?.(uri, database, token); }}><label>Database endpoint<input required value={uri} onChange={e => setUri(e.target.value)} /></label><label>Database name<input required value={database} onChange={e => setDatabase(e.target.value)} /></label><label>Individual session token<input required type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label><button className={styles.primary} disabled={session.status === 'connecting'}>Connect authorized session</button></form>{session.status === 'disconnected' && <button onClick={() => adapter.retry()}>Retry connection</button>}</section> : <>
        {applicationId && <p className={styles.caseContext}>Loan: <strong>{applications.find(item => item.application.id === applicationId)?.application.businessName}</strong></p>}
        {!jobId && !documentId && !messages.length && <section className={`${styles.upload} ${dragging ? styles.dragging : ''}`} aria-label="Contract upload" onDragOver={e => { e.preventDefault(); if (!running) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length > 1) { setError('Select one contract at a time.'); return; } choose(e.dataTransfer.files[0]); }}>
          <img src={contractFolio} width={192} height={128} className={styles.illustration} alt="" /><h2>{file ? file.name : 'Drop your loan contract here'}</h2><p>{file ? `${sizes(file.size)} · Ready to check` : 'PDF or Word document · Up to 10 MB'}</p>
          <input ref={fileInput} id="contract-file" tabIndex={-1} aria-label="Loan contract" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={running} onChange={e => choose(e.target.files?.[0])} className={styles.fileInput} />
          <div className={styles.actions}>{file ? <><button className={styles.primary} disabled={running || !applicationId || adapter.contractUploadNeedsReconciliation?.(applicationId)} onClick={() => void verify()}>{busy ? 'Checking file…' : 'Verify contract'}<Icon name="arrow" size={17} /></button><button disabled={running} onClick={() => fileInput.current?.click()}>Choose another file</button></> : <button className={styles.primary} disabled={running || !applicationId} onClick={() => fileInput.current?.click()}>Choose contract<Icon name="arrow" size={17} /></button>}</div>
          {adapter.mode === 'fixture' && <p className={styles.localNote}>Sample workspace. Selected files stay on this device.</p>}
        </section>}
        {file && messages.length > 0 && <div className={styles.fileSummary}><Icon name="document" size={22} /><div><strong>{file.name}</strong><small>{fileInfo?.format ?? 'Selected file'} · {sizes(file.size)}</small></div></div>}
        {adapter.contractUploadNeedsReconciliation?.(applicationId) && <div className={styles.reconcile}><p>A previous upload needs confirmation before another file can be sent.</p><button disabled={busy} onClick={() => { setBusy(true); const activeGeneration = generation.current; void adapter.reconcileContractUpload?.(applicationId).then(id => { if (generation.current === activeGeneration) { setDocumentId(id); setError(''); setMessages(current => [...current.filter(item => item.id !== 'intake'), { id: 'intake', text: id ? 'Your contract has been received.' : 'The previous file was not received. You can choose it again.', state: id ? 'done' : 'attention' }]); } }).catch(value => { if (generation.current === activeGeneration) setError(value instanceof Error ? value.message : 'Upload outcome is still unconfirmed.'); }).finally(() => { if (generation.current === activeGeneration) setBusy(false); }); }}>Check previous upload</button></div>}
        {stream.length > 0 && <section className={styles.pipeline} aria-label="Verification progress"><div className={styles.pipelineHeading}><h2>Verification updates</h2><span>{sample ? 'Sample run' : adapter.mode === 'live' ? 'Connected workspace' : 'File check'}</span></div><div role="log" aria-live="polite" aria-relevant="additions text" aria-label="Verification messages"><ol className={styles.messages}>{stream.map(item => <li key={item.id}><span className={`${styles.messageIcon} ${styles[item.state]}`}><Icon name={item.state === 'done' ? 'check' : item.state === 'attention' ? 'alert' : 'clock'} size={17} /></span><div><p>{item.text}</p>{item.detail && <small>{item.detail}</small>}</div></li>)}</ol></div></section>}
        {complete && <section className={styles.result}><div><Icon name={currentFindings.length ? 'alert' : 'check'} size={22} /><h2>{currentFindings.length ? `${currentFindings.length} item${currentFindings.length === 1 ? ' needs' : 's need'} review` : 'No concerns returned by these checks'}</h2></div><p>{sample ? 'These are results from the synthetic sample case.' : 'Review the supporting evidence before making a decision.'} Verification does not approve a loan.</p>{currentFindings.map(finding => <details key={finding.id}><summary>{finding.title}</summary><p>{finding.explanation}</p><p className={styles.muted}>{finding.uncertainty}</p>{finding.evidenceIds.map(id => { const evidence = view?.evidence.find(item => item.id === id); const source = view?.documents.find(item => item.id === evidence?.documentId); return evidence ? <blockquote key={id}><p>{evidence.excerpt}</p><cite>{source?.displayFilename ?? 'Stored document'} · Version {evidence.documentVersion} · {evidence.locator ?? (evidence.pageNumber ? `Page ${evidence.pageNumber}` : 'Stored excerpt')}</cite></blockquote> : null; })}</details>)}</section>}
        {(complete || failed || (messages.length > 0 && !running)) && <button className={styles.newRun} disabled={running} onClick={reset}>New verification</button>}
        {adapter.mode === 'fixture' && !running && !jobId && !messages.length && <div className={styles.sample}><button disabled={!applicationId} onClick={() => void runSample()}>Try a sample verification<Icon name="arrow" size={15} /></button><span>Sample documents · No client data</span></div>}
      </>}
      <footer className={styles.footer}><span><Icon name="shield" size={15} />Synthetic prototype · No money moves</span><span>{adapter.mode === 'live' ? 'Connected workspace' : 'Sample workspace'}</span>{fileInfo && <details><summary>File details</summary><p>{fileInfo.name} · {fileInfo.format} · {sizes(fileInfo.size)}</p><code>SHA-256 {fileInfo.sha256}</code></details>}</footer>
    </main>
  </div>;
}
