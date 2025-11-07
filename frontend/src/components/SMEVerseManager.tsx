import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient, formatError } from "../lib/apiClient";
import { 
  WorkDetail, 
  WorkSummary, 
  VerseDraft, 
  VerseListItem, 

  OriginEntry,
  AttachmentRef,
  CommentaryEntry,
  CommentaryFormData,
  ReviewHistoryEntry,
  ReviewHistoryIssue,
  SavePayload
} from "../lib/types";
import { VerseNavigator } from "./VerseNavigator";
import { EditorModal, TabConfig } from "./EditorModal";
import { VerseTab } from "./VerseTab";
import {
  AttachmentsTab,
  CommentaryTab,
  HistoryTab,
  OriginTab,
  PreviewTab,
  ReviewTab,
  SegmentsTab,
  TranslationsTab,
} from "./EditorTabs";
import { useAutosave } from "../hooks/useAutosave";

const REQUIRED_LANGS = ["bn", "en", "or", "hi", "as"] as const;
const AUTOSAVE_INTERVAL = 30_000;

const DEFAULT_TABS: TabConfig[] = [
  { key: "verse", label: "Verse" },
  { key: "translations", label: "Translations" },
  { key: "segments", label: "Segments" },
  { key: "origin", label: "Origin" },
  { key: "commentary", label: "Commentary" },
  { key: "review", label: "Review" },
  { key: "history", label: "History" },
  { key: "preview", label: "Preview" },
  { key: "attachments", label: "Attachments" },
];

function buildInitialDraft(work: WorkDetail | null): VerseDraft {
  const canonicalLang = work?.canonical_lang ?? "bn";
  const languageSet = new Set<string>([
    canonicalLang,
    "en",
    ...REQUIRED_LANGS,
    ...(work?.langs ?? []),
  ]);
  const languages = Array.from(languageSet);

  const initialTexts: Record<string, string> = {};
  const initialSegments: Record<string, string[]> = {};
  languages.forEach((lang) => {
    initialTexts[lang] = "";
    initialSegments[lang] = [];
  });

  const origin: OriginEntry[] =
    work?.source_editions?.length && work.source_editions[0]
      ? [
          {
            edition: work.source_editions[0].id,
            page: 1,
            para_index: 1,
          },
        ]
      : [];

  return {
    verseId: undefined,
    manualNumber: "",
    systemOrder: null,
    texts: initialTexts,
    segments: initialSegments,
    tags: [],
    origin,
    status: "draft",
    reviewRequired: ["editor", "linguist", "final"],
    commentary: [],
    history: [],
    attachments: [],
    meta: {},
  };
}

export function SMEVerseManager() {
  const { user } = useAuth();
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [selectedWorkId, setSelectedWorkId] = useState<string>("");
  const [workDetail, setWorkDetail] = useState<WorkDetail | null>(null);
  const [verseDraft, setVerseDraft] = useState<VerseDraft>(buildInitialDraft(null));
  const [activeTab, setActiveTab] = useState<string>("verse");
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [verseList, setVerseList] = useState<VerseListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({ offset: 0, limit: 20, total: 0 });
  const [isReviewProcessing, setReviewProcessing] = useState(false);

  const isSME = user?.roles?.includes("sme") || user?.roles?.includes("platform_admin") || user?.roles?.includes("admin");

  const fetchWorks = useCallback(async () => {
    try {
      const response = await apiClient.get<WorkSummary[]>("/works");
      setWorks(response.data);
      if (!selectedWorkId && response.data.length > 0) {
        setSelectedWorkId(response.data[0].work_id);
      }
    } catch (error) {
      setBannerMessage(`Failed to load works: ${formatError(error)}`);
    }
  }, [selectedWorkId]);

  const fetchWorkDetail = useCallback(async (workId: string) => {
    if (!workId) return;
    try {
      const response = await apiClient.get<WorkDetail>(`/works/${workId}`);
      setWorkDetail(response.data);
      setVerseDraft(buildInitialDraft(response.data));
      setDirty(false);
      setErrorMessage(null);
    } catch (error) {
      setBannerMessage(`Failed to load work: ${formatError(error)}`);
    }
  }, []);

  const loadVerseList = useCallback(async (options?: { offset?: number; query?: string }) => {
    if (!selectedWorkId) return;
    const offset = options?.offset ?? 0;
    const query = options?.query ?? searchTerm;
    setListLoading(true);
    try {
      const response = await apiClient.get<{ items: VerseListItem[]; next: { offset: number; limit: number } | null; total: number }>(`/works/${selectedWorkId}/verses`, { params: { offset, limit: pagination.limit, q: query || undefined } });
      setVerseList(response.data.items ?? []);
      const total = response.data.total ?? response.data.items?.length ?? 0;
      setPagination((prev) => ({ offset, limit: prev.limit, total }));
    } catch (error) {
      setBannerMessage(`Failed to load verses: ${formatError(error)}`);
    } finally {
      setListLoading(false);
    }
  }, [selectedWorkId, pagination.limit, searchTerm]);

  const loadVerseDetail = useCallback(async (verseId: string) => {
    if (!selectedWorkId) return;
    try {
      const response = await apiClient.get(`/works/${selectedWorkId}/verses/${verseId}`);
      const verse = response.data as any;
      const languages = Array.from(new Set<string>([...REQUIRED_LANGS, ...(workDetail?.langs ?? []), ...(Object.keys(verse?.texts ?? {}) as string[])]));
      const textMap: Record<string, string> = {};
      languages.forEach((lang) => {
        const value = verse?.texts?.[lang];
        textMap[lang] = value ?? "";
      });
      const segments: Record<string, string[]> = {};
      languages.forEach((lang) => {
        const rawSegments = verse?.segments?.[lang];
        segments[lang] = Array.isArray(rawSegments) ? rawSegments : [];
      });
      const reviewBlock = verse?.review ?? {};
      const history: ReviewHistoryEntry[] = reviewBlock.history ?? [];
      setVerseDraft({
        verseId: verse?.verse_id ?? verseId,
        manualNumber: verse?.number_manual ?? "",
        systemOrder: verse?.order ?? null,
        texts: textMap,
        segments,
        tags: verse?.tags ?? [],
        origin: verse?.origin ?? [],
        status: reviewBlock.state ?? "draft",
        reviewRequired: reviewBlock.required_reviewers ?? ["editor", "linguist", "final"],
        commentary: [],
        history,
        attachments: verse?.attachments ?? [],
        meta: verse?.meta ?? {},
      });
      setDirty(false);
      setErrorMessage(null);
      await fetchVerseCommentary(selectedWorkId, verseId);
    } catch (error) {
      setBannerMessage(`Failed to load verse: ${formatError(error)}`);
    }
  }, [selectedWorkId, workDetail]);

  const fetchVerseCommentary = useCallback(async (workId: string, verseId: string) => {
    setCommentaryLoading(true);
    try {
      const response = await apiClient.get<CommentaryEntry[]>(`/works/${workId}/verses/${verseId}/commentary`);
      setVerseDraft((prev) => ({ ...prev, commentary: response.data }));
    } catch (error) {
      setBannerMessage(`Failed to load commentary: ${formatError(error)}`);
    } finally {
      setCommentaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSME) {
      fetchWorks();
    }
  }, [isSME, fetchWorks]);

  useEffect(() => {
    if (selectedWorkId) {
      fetchWorkDetail(selectedWorkId);
      loadVerseList({ offset: 0 });
    }
  }, [selectedWorkId, fetchWorkDetail, loadVerseList]);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    loadVerseList({ offset: 0, query: term });
  }, [loadVerseList]);

  const handlePageChange = useCallback((nextOffset: number) => {
    if (nextOffset < 0) nextOffset = 0;
    loadVerseList({ offset: nextOffset });
  }, [loadVerseList]);

  const handleVerseSelect = useCallback((verseId: string | null) => {
    if (verseId) {
      loadVerseDetail(verseId);
      return;
    }
    const nextDraft = buildInitialDraft(workDetail);
    setVerseDraft(nextDraft);
    setDirty(false);
    setErrorMessage(null);
  }, [loadVerseDetail, workDetail]);

  const setDraft = useCallback((updater: (prev: VerseDraft) => VerseDraft) => {
    setVerseDraft((prev) => {
      const next = updater(prev);
      return next;
    });
    setDirty(true);
  }, []);

  const handleManualNumberChange = (value: string) => {
    setErrorMessage(null);
    setDraft((prev) => ({ ...prev, manualNumber: value }));
  };

  const handleTextChange = (lang: string, value: string) => {
    setDraft((prev) => {
      const languageUniverse = Array.from(new Set<string>([...REQUIRED_LANGS, ...(workDetail?.langs ?? [])]));
      const nextTexts: Record<string, string> = { ...prev.texts };
      languageUniverse.forEach((item) => {
        if (!(item in nextTexts)) {
          nextTexts[item] = "";
        }
      });
      nextTexts[lang] = value;
      return { ...prev, texts: nextTexts };
    });
  };

  const handleTagsChange = (tags: string[]) => {
    setDraft((prev) => ({ ...prev, tags }));
  };

  const handleSegmentsChange = useCallback((lang: string, nextSegments: string[]) => {
    setDraft((prev) => ({
      ...prev,
      segments: { ...prev.segments, [lang]: nextSegments },
    }));
  }, [setDraft]);

  const handleOriginAdd = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      origin: [...prev.origin, { edition: "", page: undefined, para_index: undefined }],
    }));
  }, [setDraft]);

  const handleOriginUpdate = useCallback((index: number, update: Partial<OriginEntry>) => {
    setDraft((prev) => {
      const next = [...prev.origin];
      next[index] = { ...next[index], ...update };
      return { ...prev, origin: next };
    });
  }, [setDraft]);

  const handleOriginRemove = useCallback((index: number) => {
    setDraft((prev) => ({
      ...prev,
      origin: prev.origin.filter((_, idx) => idx !== index),
    }));
  }, [setDraft]);

  const handleAttachmentAdd = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      attachments: [...prev.attachments, { label: "", url: "", notes: "" }],
    }));
  }, [setDraft]);

  const handleAttachmentUpdate = useCallback((index: number, update: Partial<AttachmentRef>) => {
    setDraft((prev) => {
      const next = [...prev.attachments];
      next[index] = { ...next[index], ...update };
      return { ...prev, attachments: next };
    });
  }, [setDraft]);

  const handleAttachmentRemove = useCallback((index: number) => {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, idx) => idx !== index),
    }));
  }, [setDraft]);

  const handleCommentaryCreate = useCallback(async (payload: CommentaryFormData) => {
    if (!selectedWorkId || !verseDraft.verseId) {
      setBannerMessage("Select a verse before adding commentary.");
      return;
    }
    const textsPayload = Object.fromEntries(Object.entries(payload.texts ?? {}).map(([lang, value]) => [lang, value?.trim() || ""]));
    try {
      await apiClient.post(`/works/${selectedWorkId}/verses/${verseDraft.verseId}/commentary`, {
        speaker: payload.speaker,
        source: payload.source,
        genre: payload.genre,
        tags: payload.tags,
        texts: textsPayload,
      });
      await fetchVerseCommentary(selectedWorkId, verseDraft.verseId);
      setBannerMessage("Commentary note added.");
    } catch (error) {
      setBannerMessage(`Failed to add commentary: ${formatError(error)}`);
    }
  }, [selectedWorkId, verseDraft.verseId, fetchVerseCommentary]);

  const preparePayload = useCallback((options?: { silent?: boolean }): SavePayload | null => {
    if (!workDetail) return null;

    const manualNumber = verseDraft.manualNumber.trim();
    if (!manualNumber) {
      if (!options?.silent) {
        setErrorMessage("Manual verse number is required.");
      }
      return null;
    }

    const canonicalLang = workDetail.canonical_lang;
    const canonicalText = verseDraft.texts[canonicalLang]?.trim() ?? "";
    if (!canonicalText) {
      if (!options?.silent) {
        setErrorMessage(`Canonical text (${canonicalLang.toUpperCase()}) must not be empty.`);
      }
      return null;
    }

    const textPayload: Record<string, string | null> = {};
    Object.entries(verseDraft.texts).forEach(([lang, value]) => {
      const trimmed = value?.trim() ?? "";
      textPayload[lang] = trimmed.length ? trimmed : null;
    });

    const segmentPayload: Record<string, string[]> = {};
    Object.entries(verseDraft.segments ?? {}).forEach(([lang, entries]) => {
      const sanitized = (entries ?? []).map((item) => item.trim()).filter(Boolean);
      if (sanitized.length) {
        segmentPayload[lang] = sanitized;
      }
    });

    const languageUniverse = Array.from(new Set<string>([...REQUIRED_LANGS, ...(workDetail?.langs ?? [])]));
    languageUniverse.forEach((lang) => {
      if (!(lang in textPayload)) {
        textPayload[lang] = null;
      }
      if (!(lang in segmentPayload)) {
        segmentPayload[lang] = [];
      }
    });

    return {
      number_manual: manualNumber,
      texts: textPayload,
      origin: verseDraft.origin.length ? verseDraft.origin : [{ edition: workDetail.source_editions[0]?.id ?? "UNKNOWN", page: 1, para_index: 1 }],
      tags: verseDraft.tags,
      segments: segmentPayload,
      attachments: verseDraft.attachments,
    };
  }, [verseDraft, workDetail]);

  const handleSave = useCallback(async (options?: { silent?: boolean; advance?: boolean }) => {
    if (!selectedWorkId || !workDetail) return;

    const payload = preparePayload({ silent: options?.silent });
    if (!payload) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      let savedVerseId = verseDraft.verseId;
      if (verseDraft.verseId) {
        await apiClient.put(`/works/${selectedWorkId}/verses/${verseDraft.verseId}`, payload);
      } else {
        const response = await apiClient.post(`/works/${selectedWorkId}/verses`, payload);
        const verseId = response.data?.verse_id as string | undefined;
        if (verseId) {
          savedVerseId = verseId;
          setVerseDraft((prev) => ({ ...prev, verseId }));
        }
      }

      setDirty(false);
      if (!options?.silent) {
        setBannerMessage("Verse saved successfully.");
      }

      if (!options?.silent) {
        loadVerseList({ offset: pagination.offset, query: searchTerm });
      }

      if (options?.advance) {
        setVerseDraft((prev) => ({
          ...buildInitialDraft(workDetail),
          manualNumber: incrementManualNumber(prev.manualNumber),
        }));
        setDirty(false);
      } else if (savedVerseId && !options?.silent) {
        loadVerseDetail(savedVerseId);
      }
    } catch (error) {
      const message = formatError(error);
      setErrorMessage(message);
      if (!options?.silent) {
        setBannerMessage(`Save failed: ${message}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [preparePayload, selectedWorkId, verseDraft.verseId, workDetail, loadVerseList, pagination.offset, searchTerm, loadVerseDetail]);

  useAutosave(() => handleSave({ silent: true }), dirty && !isSaving, AUTOSAVE_INTERVAL);

  const performReviewAction = useCallback(async (action: "approve" | "reject" | "flag" | "lock", issues?: ReviewHistoryIssue[]) => {
    const currentVerseId = verseDraft.verseId;
    if (!selectedWorkId || !currentVerseId) {
      setBannerMessage("Select a verse before performing review actions.");
      return;
    }
    setReviewProcessing(true);
    try {
      const endpointMap = {
        approve: `/review/verse/${currentVerseId}/approve`,
        reject: `/review/verse/${currentVerseId}/reject`,
        flag: `/review/verse/${currentVerseId}/flag`,
        lock: `/review/verse/${currentVerseId}/lock`,
      } as const;
      const payload: Record<string, unknown> = { work_id: selectedWorkId };
      if (action === "reject") {
        payload.issues = issues ?? [];
      }
      await apiClient.post(endpointMap[action], payload);
      await loadVerseDetail(currentVerseId);
      await loadVerseList({ offset: pagination.offset, query: searchTerm });
      const actionMessage = action === "approve" ? "approved" : action === "reject" ? "sent back with requested changes" : action === "flag" ? "flagged for follow-up" : "locked";
      setBannerMessage(`Verse ${currentVerseId} ${actionMessage}.`);
    } catch (error) {
      setBannerMessage(`Review action failed: ${formatError(error)}`);
    } finally {
      setReviewProcessing(false);
    }
  }, [verseDraft.verseId, selectedWorkId, loadVerseDetail, loadVerseList, pagination.offset, searchTerm]);

  const canonicalLang = workDetail?.canonical_lang ?? "bn";
  const workLanguages = useMemo(() => Array.from(new Set([...REQUIRED_LANGS, ...(workDetail?.langs ?? [])])), [workDetail?.langs]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!(verseDraft.texts[canonicalLang]?.trim())) {
      errors.push(`Canonical text (${canonicalLang.toUpperCase()}) is required.`);
    }
    if (!verseDraft.origin.length) {
      errors.push("At least one origin reference is required before submission.");
    }
    if (!verseDraft.manualNumber.trim()) {
      errors.push("Manual verse number is required.");
    }
    return errors;
  }, [verseDraft.texts, verseDraft.origin, verseDraft.manualNumber, canonicalLang]);

  const canApprove = Boolean(isSME && verseDraft.verseId);
  const canReject = Boolean(isSME && verseDraft.verseId);
  const canFlag = Boolean(isSME && verseDraft.verseId);
  const canLock = Boolean(isSME && verseDraft.verseId);

  const handleApproveAction = useCallback(async () => {
    if (validationErrors.length) {
      setBannerMessage(`Resolve validation issues before approval: ${validationErrors.join("; ")}`);
      return;
    }
    await performReviewAction("approve");
  }, [performReviewAction, validationErrors]);

  const handleRejectAction = useCallback(async (issues: ReviewHistoryIssue[]) => {
    await performReviewAction("reject", issues);
  }, [performReviewAction]);

  const handleFlagAction = useCallback(async () => {
    await performReviewAction("flag");
  }, [performReviewAction]);

  const handleLockAction = useCallback(async () => {
    await performReviewAction("lock");
  }, [performReviewAction]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "verse":
        return (
          <VerseTab
            draft={verseDraft}
            canonicalLang={canonicalLang}
            workId={workDetail?.work_id ?? ""}
            workLangs={workLanguages}
            errorMessage={errorMessage}
            onManualNumberChange={handleManualNumberChange}
            onTextChange={handleTextChange}
            onTagsChange={handleTagsChange}
          />
        );
      case "translations":
        return (
          <TranslationsTab
            languages={workLanguages}
            canonicalLang={canonicalLang}
            texts={verseDraft.texts}
            onChange={handleTextChange}
          />
        );
      case "segments":
        return (
          <SegmentsTab
            languages={workLanguages}
            segments={verseDraft.segments}
            texts={verseDraft.texts}
            onChange={handleSegmentsChange}
          />
        );
      case "origin":
        return (
          <OriginTab
            origin={verseDraft.origin}
            editions={workDetail?.source_editions ?? []}
            onAdd={handleOriginAdd}
            onUpdate={handleOriginUpdate}
            onRemove={handleOriginRemove}
          />
        );
      case "commentary":
        return (
          <CommentaryTab
            verseId={verseDraft.verseId}
            languages={workLanguages}
            entries={verseDraft.commentary}
            loading={commentaryLoading}
            onCreate={handleCommentaryCreate}
            onDuplicate={async () => {}}
          />
        );
      case "review":
        return (
          <ReviewTab
            status={verseDraft.status}
            requiredReviewers={verseDraft.reviewRequired}
            validationErrors={validationErrors}
            canApprove={!isReviewProcessing && canApprove}
            canReject={!isReviewProcessing && canReject}
            canFlag={!isReviewProcessing && canFlag}
            canLock={!isReviewProcessing && canLock}
            isProcessing={isReviewProcessing}
            onApprove={handleApproveAction}
            onReject={handleRejectAction}
            onFlag={handleFlagAction}
            onLock={handleLockAction}
            previewNumber={verseDraft.manualNumber || verseDraft.verseId || null}
            previewTexts={verseDraft.texts}
          />
        );
      case "history":
        return <HistoryTab history={verseDraft.history} />;
      case "preview":
        return (
          <PreviewTab
            canonicalLang={canonicalLang}
            languages={workLanguages}
            texts={verseDraft.texts}
            commentary={verseDraft.commentary}
          />
        );
      case "attachments":
        return (
          <AttachmentsTab
            attachments={verseDraft.attachments}
            onAdd={handleAttachmentAdd}
            onUpdate={handleAttachmentUpdate}
            onRemove={handleAttachmentRemove}
          />
        );
      default:
        return null;
    }
  };

  if (!isSME) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400">You don't have SME permissions to access the verse editor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Verse Editor</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => handleSave({ advance: true })}
            disabled={isSaving}
            className="rounded-md border border-brand px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand hover:text-white disabled:opacity-50"
          >
            Save & Next
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">
          <div className="flex items-center justify-between">
            <span>{bannerMessage}</span>
            <button
              onClick={() => setBannerMessage(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <select
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          value={selectedWorkId}
          onChange={(e) => setSelectedWorkId(e.target.value)}
        >
          {works.map((work) => (
            <option key={work.work_id} value={work.work_id}>
              {work.title.en ?? work.title.bn ?? work.work_id}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <VerseNavigator
          items={verseList}
          loading={listLoading}
          total={pagination.total}
          offset={pagination.offset}
          limit={pagination.limit}
          searchTerm={searchTerm}
          onSearch={handleSearch}
          onSelect={handleVerseSelect}
          selectedVerseId={verseDraft.verseId}
          onPageChange={handlePageChange}
          onCreateNew={() => handleVerseSelect(null)}
        />

        <div className="flex-1 min-w-0">
          <EditorModal
            title={workDetail ? `${workDetail.title.en ?? workDetail.work_id} - Verse Editor` : "Verse Editor"}
            tabs={DEFAULT_TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          >
            {renderActiveTab()}
          </EditorModal>
        </div>
      </div>
    </div>
  );
}

function incrementManualNumber(current: string): string {
  const numeric = parseInt(current, 10);
  if (Number.isNaN(numeric)) {
    return current;
  }
  return String(numeric + 1);
}