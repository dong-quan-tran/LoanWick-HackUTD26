import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import type { FrontendAdapter, SessionState } from '../adapters/types';
import { readable } from '../adapters/types';
import { Icon } from './Icon';
import styles from './WorkspaceShell.module.css';

export function WorkspaceShell({ adapter, session, applicationId, chromeVisible = true, mainId = 'main', children }: {
  adapter: FrontendAdapter;
  session: SessionState;
  applicationId?: string;
  chromeVisible?: boolean;
  mainId?: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationId = useId();
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const selectedCase = applicationId || location.pathname.match(/\/(?:cases|borrower)\/([^/]+)/)?.[1] || session.defaultApplicationId || 'app-excavator-a';
  const borrower = session.user?.role === 'borrower';
  const home = borrower ? `/borrower/${selectedCase}` : '/applications';

  useEffect(() => { setNavigationOpen(false); }, [location.pathname]);
  const switchRole = (role: 'officer' | 'borrower' | 'reviewer') => {
    adapter.selectIdentity?.(role, selectedCase);
    navigate(role === 'borrower' ? `/borrower/${selectedCase}` : `/cases/${selectedCase}`);
  };

  return <div className={`${styles.shell} ${!chromeVisible ? styles.withoutChrome : ''}`}>
    {chromeVisible && <>
      <a className={styles.skip} href={`#${mainId}`}>Skip to workspace</a>
      <aside className={styles.rail} aria-label="Application navigation">
        <div className={styles.railHeading}>
          <Link to={home} className={styles.brand}>
            <span className={styles.brandMark}><svg viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="m5 8 4 14 6-10 6 10 4-14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            LoanWick
          </Link>
          <button ref={navigationToggle} className={styles.navigationToggle} aria-expanded={navigationOpen} aria-controls={navigationId} onClick={() => setNavigationOpen(open => !open)}><Icon name={navigationOpen ? 'close' : 'menu'} size={19} />Menu</button>
        </div>
        <p className={styles.railCaption}>Investigation workspace</p>
        <nav id={navigationId} aria-label="Workspace" className={navigationOpen ? styles.navigationOpen : ''} onKeyDown={event => {
          if (event.key === 'Escape') { setNavigationOpen(false); navigationToggle.current?.focus(); }
        }}>
          {borrower ? <NavLink to={home}><Icon name="folder" size={18} />Your application</NavLink> : <>
            {session.user?.role === 'officer' && <NavLink to="/verify"><Icon name="document" size={18} />Verify contract</NavLink>}
            <NavLink to="/applications"><Icon name="grid" size={18} />Applications</NavLink>
            <NavLink to={`/cases/${selectedCase}`}><Icon name="folder" size={18} />Case workspace</NavLink>
          </>}
        </nav>
        <div className={styles.railBottom}><Icon name="shield" size={18} /><p>Evidence first.<br />Human decisions.</p><small>Synthetic prototype<br />No real banking integrations.</small></div>
      </aside>
    </>}
    <div className={styles.frame}>
      {chromeVisible && <>
        <header className={styles.topbar}>
          <div className={styles.connection}><span className={`${styles.connectionDot} ${session.status !== 'connected' ? styles.disconnected : ''}`} /><span>{readable(session.status)}</span><span className={styles.separator}>/</span><strong>{adapter.mode === 'fixture' ? 'Fixture data' : 'Live database'}</strong></div>
          <div className={styles.sessionControls}>
            {adapter.selectIdentity && <label>Demo role<select aria-label="Demo role" value={session.user?.role ?? 'officer'} onChange={event => switchRole(event.target.value as 'officer' | 'borrower' | 'reviewer')}><option value="officer">Officer</option><option value="borrower">Borrower</option><option value="reviewer">Reviewer</option></select></label>}
            {!adapter.selectIdentity && session.user && <><span className={styles.role}>{readable(session.user.role)}</span><button onClick={() => adapter.disconnect()}>Disconnect</button></>}
            <span className={styles.avatar}><Icon name="user" size={17} /></span>
          </div>
        </header>
        <div className={styles.synthetic}>Synthetic data · No money moves{adapter.mode === 'fixture' && <span>Role switching is a demo, not authentication.</span>}</div>
      </>}
      {children}
      {chromeVisible && adapter.mode === 'fixture' && <footer className={styles.demoTools}><details><summary>Demo controls</summary><label>Failure scenario<select aria-label="Failure scenario" onChange={event => adapter.setFailure?.(event.target.value as 'none' | 'offline' | 'investigation')}><option value="none">None</option><option value="offline">Disconnected</option><option value="investigation">Investigation failure</option></select></label><button onClick={() => {
        if (window.confirm('Reset all synthetic cases, responses, checks, and releases?')) { adapter.reset?.(); navigate('/applications'); }
      }}><Icon name="refresh" size={16} />Reset synthetic demo</button><small>Local deterministic checks only. No model calls or real payments.</small></details></footer>}
    </div>
  </div>;
}
