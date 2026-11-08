import type { BorrowerCaseView, CaseAdapter, DomainError, Unsubscribe, User } from '@loanwick/contracts/domain';
export type BorrowerApplicationSummary = BorrowerCaseView['application'] & { pendingRequestCount: number };
export const prioritizeBorrowerApplications = (items: BorrowerApplicationSummary[]) => items.sort((a, b) => b.pendingRequestCount - a.pendingRequestCount || a.businessName.localeCompare(b.businessName) || a.id.localeCompare(b.id));
export interface SessionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'forbidden';
  user: User | null;
  message: string | null;
  defaultApplicationId?: string | undefined;
}
export interface FrontendAdapter extends CaseAdapter {
  readonly mode: 'fixture' | 'live';
  subscribeSession(value: (session: SessionState) => void): Unsubscribe;
  subscribeBorrowerApplications?(value: (items: BorrowerApplicationSummary[]) => void, error: (error: DomainError) => void): Unsubscribe;
  source(documentId: string, version: number): Promise<string>;
  retry(): void;
  disconnect(): void;
  selectIdentity?(role: 'officer' | 'borrower' | 'reviewer', applicationId: string): void;
  reset?(): void;
  attachSyntheticCorrection?(requestId: string): Promise<string>;
  canAttachSyntheticCorrection?(requestId: string): boolean;
  uploadDocument?: ((requestId: string, file: File) => Promise<string>) | undefined;
  uploadNeedsReconciliation?(requestId: string): boolean;
  reconcileUpload?(requestId: string): Promise<string | null>;
  setFailure?(failure: 'none' | 'offline' | 'investigation'): void;
  startupNotice?: string;
}
export class OperationFailure extends Error {
  constructor(public readonly detail: DomainError) { super(detail.message); }
}
export const correlationId = () => crypto.randomUUID();
export const readable = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().replace(/^./, x => x.toUpperCase());
