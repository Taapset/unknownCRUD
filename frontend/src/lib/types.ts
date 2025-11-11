export type ReviewState =
  | "draft"
  | "submitted"
  | "review_pending"
  | "reviewer_approved"
  | "admin_approved"
  | "sme_approved"
  | "approved"
  | "locked"
  | "rejected"
  | "flagged"
  | "sme_rollback";

export interface WorkSummary {
  work_id: string;
  title: Record<string, string | null>;
  langs: string[];
}

export interface SourceEdition {
  id: string;
  lang: string;
  type: string;
  provenance?: string | null;
}

export interface WorkDetail extends WorkSummary {
  author?: string | null;
  canonical_lang: string;
  structure: Record<string, string | null>;
  source_editions: SourceEdition[];
  policy?: Record<string, unknown>;
}

export interface VerseDraft {
  verseId?: string;
  manualNumber: string;
  systemOrder: number | null;
  texts: Record<string, string>;
  segments: Record<string, string[]>;
  tags: string[];
  origin: OriginEntry[];
  status: ReviewState;
  reviewRequired: string[];
  commentary: CommentaryEntry[];
  history: ReviewHistoryEntry[];
  attachments: AttachmentRef[];
  meta?: Record<string, string | null>;
}

export interface OriginEntry {
  edition: string;
  page?: number | null;
  para_index?: number | null;
}

export interface SavePayload {
  number_manual: string;
  texts: Record<string, string | null>;
  origin: OriginEntry[];
  tags: string[];
  segments: Record<string, string[]>;
  attachments?: AttachmentRef[];
}

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  approved?: boolean;
  enabled?: boolean;
  twoFactorEnabled?: boolean;
  created_at?: string;
}

export interface VerseListItem {
  verse_id: string;
  number_manual?: string | null;
  review?: {
    state: ReviewState;
  };
  texts?: Record<string, string | null>;
  tags?: string[];
}

export interface CommentaryEntry {
  commentary_id: string;
  work_id?: string | null;
  verse_id?: string | null;
  targets?: { kind: string; ids: string[] }[];
  speaker?: string | null;
  source?: string | null;
  date?: { iso?: string | null };
  genre?: string | null;
  tags?: string[];
  texts: Record<string, string | null>;
  review?: {
    state: ReviewState;
  };
}

export interface ReviewHistoryIssue {
  path?: string | null;
  lang?: string | null;
  problem?: string | null;
  found?: string | null;
  expected?: string | null;
  suggestion?: string | null;
  severity?: string | null;
}

export interface AttachmentRef {
  label: string;
  url: string;
  notes?: string | null;
}

export interface ReviewHistoryEntry {
  ts: string;
  actor: string;
  action: string;
  from?: string | null;
  to?: string | null;
  issues?: ReviewHistoryIssue[];
}

export interface CommentaryFormData {
  speaker?: string | null;
  source?: string | null;
  genre?: string | null;
  tags: string[];
  texts: Record<string, string>;
  targets?: { kind: string; ids: string[] }[];
  date?: { iso?: string | null };
}
