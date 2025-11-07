import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { HeaderBar } from "./components/HeaderBar";
import { VerseNavigator } from "./components/VerseNavigator";
import { EditorModal, TabConfig } from "./components/EditorModal";
import { VerseTab } from "./components/VerseTab";
import { HomePage } from "./components/HomePage";
import { AdminPage } from "./components/AdminPage";
import { AdminLoginPage } from "./components/AdminLoginPage";
import { SMEDashboard } from "./components/SMEDashboard";
import { SMELoginPage } from "./components/SMELoginPage";
import { CommandPalette } from "./components/CommandPalette";
import {
  AttachmentsTab,
  CommentaryTab,
  HistoryTab,
  OriginTab,
  PreviewTab,
  ReviewTab,
  SegmentsTab,
  TranslationsTab,
} from "./components/EditorTabs";
import { useAuth } from "./context/AuthContext";
import { useAutosave } from "./hooks/useAutosave";
import { API_BASE_URL, apiClient, formatError } from "./lib/apiClient";
import {
  AttachmentRef,
  CommentaryEntry,
  CommentaryFormData,
  OriginEntry,
  ReviewHistoryEntry,
  ReviewHistoryIssue,
  ReviewState,
  SavePayload,
  VerseDraft,
  VerseListItem,
  WorkDetail,
  WorkSummary,
} from "./lib/types";

interface SaveOptions {
  silent?: boolean;
  advance?: boolean;
}

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

const STATUS_DEFAULT: ReviewState = "draft";

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
    status: STATUS_DEFAULT,
    reviewRequired: ["editor", "linguist", "final"],
    commentary: [],
    history: [],
    attachments: [],
    meta: {},
  };
}

function formatTimestamp(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AppContent() {
  const navigate = useNavigate();
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [selectedWorkId, setSelectedWorkId] = useState<string>("");
  const [workDetail, setWorkDetail] = useState<WorkDetail | null>(null);
  const [verseDraft, setVerseDraft] = useState<VerseDraft>(buildInitialDraft(null));
  const [activeTab, setActiveTab] = useState<string>("verse");
  

  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [verseList, setVerseList] = useState<VerseListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({ offset: 0, limit: 20, total: 0 });
  const [connection, setConnection] = useState({
    healthy: null as boolean | null,
    checking: true,
    baseUrl: API_BASE_URL,
  });

  const [isReviewProcessing, setReviewProcessing] = useState(false);

  const { user, loading, logout } = useAuth();





  const handleLogout = useCallback(async () => {
    try {
      await logout();
      setBannerMessage("Signed out successfully.");
    } catch (error) {
      setBannerMessage(`Logout failed: ${formatError(error)}`);
    }
  }, [logout]);

  const pingConnection = useCallback(async () => {
    setConnection((prev) => ({ ...prev, checking: true }));
    try {
      await apiClient.get("/health", { timeout: 5000 });
      setConnection({ healthy: true, checking: false, baseUrl: API_BASE_URL });
    } catch {
      setConnection({ healthy: false, checking: false, baseUrl: API_BASE_URL });
    }
  }, []);

  const fetchWorks = useCallback(async () => {
    try {
      const response = await apiClient.get<WorkSummary[]>("/works");
      setWorks(response.data);
      if (!selectedWorkId && response.data.length > 0) {
        setSelectedWorkId(response.data[0].work_id);
      }
    } catch (error) {
      setWorks([]);
      setBannerMessage(`Failed to load works: ${formatError(error)}`);
    }
  }, [selectedWorkId]);

  const fetchWorkDetail = useCallback(
    async (workId: string) => {
      if (!workId) {
        return;
      }
      try {
        const response = await apiClient.get<WorkDetail>(`/works/${workId}`);
        setWorkDetail(response.data);
        setVerseDraft(buildInitialDraft(response.data));
        setDirty(false);
        setLastSavedAt(null);
        setErrorMessage(null);
      } catch (error) {
        setWorkDetail(null);
        setBannerMessage(`Failed to load work: ${formatError(error)}`);
      }
    },
    [],
  );

  const fetchVerseCommentary = useCallback(
    async (workId: string, verseId: string) => {
      setCommentaryLoading(true);
      try {
        const response = await apiClient.get<CommentaryEntry[]>(
          `/works/${workId}/verses/${verseId}/commentary`,
        );
        setVerseDraft((prev) => ({ ...prev, commentary: response.data }));
      } catch (error) {
        setBannerMessage(`Failed to load commentary: ${formatError(error)}`);
      } finally {
        setCommentaryLoading(false);
      }
    },
    [],
  );

  const loadVerseList = useCallback(
    async (options?: { offset?: number; query?: string }) => {
      if (!selectedWorkId) {
        return;
      }
      const offset = options?.offset ?? 0;
      const query = options?.query ?? searchTerm;
      setListLoading(true);
      try {
        const response = await apiClient.get<{ items: VerseListItem[]; next: { offset: number; limit: number } | null; total: number }>(
          `/works/${selectedWorkId}/verses`,
          { params: { offset, limit: pagination.limit, q: query || undefined } },
        );
        setVerseList(response.data.items ?? []);
        const total = response.data.total ?? response.data.items?.length ?? 0;
        setPagination((prev) => ({ offset, limit: prev.limit, total }));
      } catch (error) {
        setVerseList([]);
        setBannerMessage(`Failed to load verses: ${formatError(error)}`);
      } finally {
        setListLoading(false);
      }
    },
    [selectedWorkId, pagination.limit, searchTerm],
  );

  const loadVerseDetail = useCallback(
    async (verseId: string) => {
      if (!selectedWorkId) {
        return;
      }
      try {
        const response = await apiClient.get(`/works/${selectedWorkId}/verses/${verseId}`);
        const verse = response.data as any;
        const languages = Array.from(
          new Set<string>([
            ...REQUIRED_LANGS,
            ...(workDetail?.langs ?? []),
            ...(Object.keys(verse?.texts ?? {}) as string[]),
          ]),
        );
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
          status: reviewBlock.state ?? STATUS_DEFAULT,
          reviewRequired: reviewBlock.required_reviewers ?? ["editor", "linguist", "final"],
          commentary: [],
          history,
          attachments: verse?.attachments ?? [],
          meta: verse?.meta ?? {},
        });
        setDirty(false);
        setErrorMessage(null);
        await fetchVerseCommentary(selectedWorkId, verseId);
        setLastSavedAt(null);
      } catch (error) {
        setCommentaryLoading(false);
        setBannerMessage(`Failed to load verse: ${formatError(error)}`);
      }
    },
    [selectedWorkId, workDetail, fetchVerseCommentary],
  );

  useEffect(() => {
    void fetchWorks();
  }, [fetchWorks]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteQuery((current) => (current ? current : searchTerm));
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchTerm]);

  useEffect(() => {
    if (!isPaletteOpen) {
      setPaletteQuery("");
    }
  }, [isPaletteOpen]);


  useEffect(() => {
    void pingConnection();
    const id = window.setInterval(() => {
      void pingConnection();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [pingConnection]);

  useEffect(() => {
    if (selectedWorkId) {
      void fetchWorkDetail(selectedWorkId);
      void loadVerseList({ offset: 0 });
    } else {
      setVerseList([]);
      setPagination((prev) => ({ ...prev, offset: 0, total: 0 }));
    }
  }, [selectedWorkId, fetchWorkDetail, loadVerseList]);

  const handleSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      void loadVerseList({ offset: 0, query: term });
    },
    [loadVerseList],
  );

  const handlePageChange = useCallback(
    (nextOffset: number) => {
      if (nextOffset < 0) {
        nextOffset = 0;
      }
      void loadVerseList({ offset: nextOffset });
    },
    [loadVerseList],
  );

  const handleVerseSelect = useCallback(
    (verseId: string | null) => {
      if (verseId) {
        void loadVerseDetail(verseId);
        return;
      }
      const nextDraft = buildInitialDraft(workDetail);
      setVerseDraft(nextDraft);
      setDirty(false);
      setLastSavedAt(null);
      setErrorMessage(null);
    },
    [loadVerseDetail, workDetail],
  );

  const openCommandPalette = useCallback(() => {
    setPaletteQuery(searchTerm);
    setPaletteOpen(true);
    handleSearch(searchTerm);
  }, [searchTerm, handleSearch]);

  const handleCommandSelect = useCallback(
    (verseId: string) => {
      handleVerseSelect(verseId);
      setPaletteOpen(false);
      setPaletteQuery("");
    },
    [handleVerseSelect],
  );

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
      const languageUniverse = Array.from(
        new Set<string>([...REQUIRED_LANGS, ...(workDetail?.langs ?? [])]),
      );
      const nextTexts: Record<string, string> = { ...prev.texts };
      languageUniverse.forEach((item) => {
        if (!(item in nextTexts)) {
          nextTexts[item] = "";
        }
      });
      nextTexts[lang] = value;
      return {
        ...prev,
        texts: nextTexts,
      };
    });
  };

  const handleTagsChange = (tags: string[]) => {
    setDraft((prev) => ({ ...prev, tags }));
  };

  const handleSegmentsChange = useCallback(
    (lang: string, nextSegments: string[]) => {
      setDraft((prev) => ({
        ...prev,
        segments: {
          ...prev.segments,
          [lang]: nextSegments,
        },
      }));
    },
    [setDraft],
  );

  const handleOriginAdd = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      origin: [
        ...prev.origin,
        {
          edition: "",
          page: undefined,
          para_index: undefined,
        },
      ],
    }));
  }, [setDraft]);

  const handleOriginUpdate = useCallback(
    (index: number, update: Partial<OriginEntry>) => {
      setDraft((prev) => {
        const next = [...prev.origin];
        next[index] = { ...next[index], ...update };
        return { ...prev, origin: next };
      });
    },
    [setDraft],
  );

  const handleOriginRemove = useCallback(
    (index: number) => {
      setDraft((prev) => {
        const next = prev.origin.filter((_, idx) => idx !== index);
        return { ...prev, origin: next };
      });
    },
    [setDraft],
  );

  const handleAttachmentAdd = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      attachments: [
        ...prev.attachments,
        { label: "", url: "", notes: "" },
      ],
    }));
  }, [setDraft]);

  const handleAttachmentUpdate = useCallback(
    (index: number, update: Partial<AttachmentRef>) => {
      setDraft((prev) => {
        const next = [...prev.attachments];
        next[index] = { ...next[index], ...update };
        return { ...prev, attachments: next };
      });
    },
    [setDraft],
  );

  const handleAttachmentRemove = useCallback(
    (index: number) => {
      setDraft((prev) => {
        const next = prev.attachments.filter((_, idx) => idx !== index);
        return { ...prev, attachments: next };
      });
    },
    [setDraft],
  );

  const handleCommentaryCreate = useCallback(
    async (payload: CommentaryFormData) => {
      if (!selectedWorkId || !verseDraft.verseId) {
        setBannerMessage("Select a verse before adding commentary.");
        return;
      }
      const textsPayload = Object.fromEntries(
        Object.entries(payload.texts ?? {}).map(([lang, value]) => [lang, value?.trim() || ""]),
      );
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
    },
    [selectedWorkId, verseDraft.verseId, fetchVerseCommentary],
  );

  const handleCommentaryDuplicate = useCallback(
    async (commentaryId: string, targetVerseId: string) => {
      if (!selectedWorkId) {
        return;
      }
      const source = verseDraft.commentary.find(
        (entry) => entry.commentary_id === commentaryId,
      );
      if (!source) {
        setBannerMessage("Unable to duplicate commentary: entry not found.");
        return;
      }
      try {
        await apiClient.post(`/works/${selectedWorkId}/verses/${targetVerseId}/commentary`, {
          speaker: source.speaker,
          source: source.source,
          genre: source.genre,
          tags: source.tags ?? [],
          texts: Object.fromEntries(
            Object.entries(source.texts ?? {}).map(([lang, value]) => [lang, value ?? ""]),
          ),
        });
        if (targetVerseId === verseDraft.verseId) {
          await fetchVerseCommentary(selectedWorkId, targetVerseId);
        }
        setBannerMessage(`Commentary duplicated to ${targetVerseId}.`);
      } catch (error) {
        setBannerMessage(`Failed to duplicate commentary: ${formatError(error)}`);
      }
    },
    [selectedWorkId, verseDraft.commentary, verseDraft.verseId, fetchVerseCommentary],
  );

  const preparePayload = useCallback(
    (options?: { silent?: boolean }): SavePayload | null => {
      if (!workDetail) {
        return null;
      }

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
          setErrorMessage(
            `Canonical text (${canonicalLang.toUpperCase()}) must not be empty.`,
          );
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

      const languageUniverse = Array.from(
        new Set<string>([...REQUIRED_LANGS, ...(workDetail?.langs ?? [])]),
      );
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
        origin: verseDraft.origin.length
          ? verseDraft.origin
          : [
              {
                edition: workDetail.source_editions[0]?.id ?? "UNKNOWN",
                page: 1,
                para_index: 1,
              },
            ],
        tags: verseDraft.tags,
        segments: segmentPayload,
        attachments: verseDraft.attachments,
      };
    },
    [verseDraft, workDetail],
  );

  const handleSave = useCallback(
    async (options?: SaveOptions) => {
      if (!selectedWorkId || !workDetail) {
        return;
      }

      const payload = preparePayload({ silent: options?.silent });
      if (!payload) {
        return;
      }

      setIsSaving(true);
      setErrorMessage(null);
      try {
        let savedVerseId = verseDraft.verseId;
        if (verseDraft.verseId) {
          await apiClient.put(
            `/works/${selectedWorkId}/verses/${verseDraft.verseId}`,
            payload,
          );
        } else {
          const response = await apiClient.post(
            `/works/${selectedWorkId}/verses`,
            payload,
          );
          const verseId = response.data?.verse_id as string | undefined;
          if (verseId) {
            savedVerseId = verseId;
            setVerseDraft((prev) => ({ ...prev, verseId }));
          }
        }

        setDirty(false);
        setLastSavedAt(new Date().toISOString());
        if (!options?.silent) {
          setBannerMessage("Verse saved successfully.");
        }

        if (!options?.silent) {
          void loadVerseList({ offset: pagination.offset, query: searchTerm });
        }

        if (options?.advance) {
          setVerseDraft((prev) => ({
            ...buildInitialDraft(workDetail),
            manualNumber: incrementManualNumber(prev.manualNumber),
          }));
          setLastSavedAt(null);
          setDirty(false);
        } else if (savedVerseId && !options?.silent) {
          void loadVerseDetail(savedVerseId);
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
    },
    [preparePayload, selectedWorkId, verseDraft.verseId, workDetail, loadVerseList, pagination.offset, searchTerm, loadVerseDetail],
  );

  useAutosave(
    () => handleSave({ silent: true }),
    dirty && !isSaving,
    AUTOSAVE_INTERVAL,
  );

  const handleSaveAndNext = () => {
    void handleSave({ advance: true });
  };

  const formattedSavedAt = useMemo(
    () => formatTimestamp(lastSavedAt),
    [lastSavedAt],
  );

  const canonicalLang = workDetail?.canonical_lang ?? "bn";
  const workLanguages = useMemo(
    () => Array.from(new Set([...REQUIRED_LANGS, ...(workDetail?.langs ?? [])])),
    [workDetail?.langs],
  );

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

  // New permission logic based on roles and workflow

  const isReviewer = user?.roles?.includes("reviewer");
  const isSME = user?.roles?.includes("sme") || user?.roles?.includes("final");
  const isPlatformAdmin = user?.roles?.includes("platform_admin") || user?.roles?.includes("admin");
  
  // Check if current user created this verse
  const isVerseCreator = verseDraft.verseId && user?.email && 
    verseDraft.meta?.entered_by === user.email;
  
  const canApprove = Boolean((isReviewer || isPlatformAdmin || isSME) && !!verseDraft.verseId && !isVerseCreator);
  const canReject = Boolean((isReviewer || isPlatformAdmin || isSME) && !!verseDraft.verseId && !isVerseCreator);
  const canFlag = Boolean((isReviewer || isPlatformAdmin || isSME) && !!verseDraft.verseId && !isVerseCreator);
  const canLock = Boolean((isPlatformAdmin || isSME) && !!verseDraft.verseId);
  


  const handleValidate = useCallback(() => {
    if (validationErrors.length) {
      setBannerMessage(`Validation failed: ${validationErrors.join("; ")}`);
    } else {
      setBannerMessage("Validation passed. Ready for review.");
    }
  }, [validationErrors]);

  const performReviewAction = useCallback(
    async (
      action: "approve" | "reject" | "flag" | "lock",
      issues?: ReviewHistoryIssue[],
    ) => {
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
        const actionMessage =
          action === "approve"
            ? "approved"
            : action === "reject"
            ? "sent back with requested changes"
            : action === "flag"
            ? "flagged for follow-up"
            : "locked";
        setBannerMessage(`Verse ${currentVerseId} ${actionMessage}.`);
      } catch (error) {
        setBannerMessage(`Review action failed: ${formatError(error)}`);
      } finally {
        setReviewProcessing(false);
      }
    },
    [
      verseDraft.verseId,
      selectedWorkId,
      loadVerseDetail,
      loadVerseList,
      pagination.offset,
      searchTerm,
    ],
  );

  const handleApproveAction = useCallback(async () => {
    if (validationErrors.length) {
      setBannerMessage(`Resolve validation issues before approval: ${validationErrors.join("; ")}`);
      return;
    }
    await performReviewAction("approve");
  }, [performReviewAction, validationErrors]);

  const handleRejectAction = useCallback(
    async (issues: ReviewHistoryIssue[]) => {
      await performReviewAction("reject", issues);
    },
    [performReviewAction],
  );

  const handleFlagAction = useCallback(async () => {
    await performReviewAction("flag");
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
            onDuplicate={handleCommentaryDuplicate}
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

  const handleLockAction = useCallback(async () => {
    await performReviewAction("lock");
  }, [performReviewAction]);

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Force login - show homepage if not authenticated
  if (!user) {
    return <HomePage />;
  }



  return (
    <div className="min-h-screen bg-slate-950 pb-12">
      <HeaderBar
        works={works}
        selectedWorkId={selectedWorkId}
        onWorkChange={setSelectedWorkId}
        status={verseDraft.status}
        isSaving={isSaving}
        lastSavedAt={formattedSavedAt}
        connection={connection}
        userEmail={user?.email ?? null}
        onLogoutClick={() => void handleLogout()}
        onAdminClick={() => navigate('/admin')}
        showAdminButton={user?.roles?.includes("platform_admin") || user?.roles?.includes("admin")}
        onSave={() => void handleSave()}
        onSaveNext={handleSaveAndNext}
        onValidate={handleValidate}
        onOpenVerseJump={openCommandPalette}
      />

      <main className="mx-auto max-w-7xl px-4 sm:px-6">

        
        {bannerMessage && (
          <div className="mt-4 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 sm:mt-6 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between">
              <span className="pr-2">{bannerMessage}</span>
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-white"
                onClick={() => setBannerMessage(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-6 lg:flex-row">
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
              title={
                workDetail
                  ? `${workDetail.title.en ?? workDetail.work_id} - Verse Editor`
                  : "Verse Editor"
              }
              tabs={DEFAULT_TABS}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            >
              {renderActiveTab()}
            </EditorModal>
          </div>
        </div>
      </main>
      <CommandPalette
        isOpen={isPaletteOpen}
        query={paletteQuery}
        items={verseList}
        loading={listLoading}
        onQueryChange={(value) => {
          setPaletteQuery(value);
          void handleSearch(value);
        }}
        onClose={() => setPaletteOpen(false)}
        onSelect={(verseId) => handleCommandSelect(verseId)}
      />
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/sme" element={<SMERoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function AdminRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<{ id: string; email: string; roles: string[] } | null>(null);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }
  
  // Check if current user is admin
  const isCurrentUserAdmin = user?.roles?.includes("platform_admin") || user?.roles?.includes("admin");
  
  // Use current user if they're admin, otherwise require admin login
  const effectiveAdminUser = isCurrentUserAdmin ? user : adminUser;
  
  // If no admin user logged in, show admin login
  if (!effectiveAdminUser) {
    return <AdminLoginPage onLogin={setAdminUser} />;
  }
  
  return (
    <div>
      <div className="bg-slate-950 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-brand hover:text-white"
          >
            ← Back to Verse Editor
          </button>
          <div className="text-sm text-slate-400">
            Admin: {effectiveAdminUser?.email}
          </div>
        </div>
      </div>
      <AdminPage 
        adminUser={effectiveAdminUser} 
        onLogout={() => setAdminUser(null)} 
      />
    </div>
  );
}

function SMERoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [smeUser, setSmeUser] = useState<{ id: string; email: string; roles: string[] } | null>(null);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }
  
  // Check if current user is SME
  const isCurrentUserSME = user?.roles?.includes("sme") || user?.roles?.includes("platform_admin") || user?.roles?.includes("admin");
  
  // Use current user if they're SME, otherwise require SME login
  const effectiveSMEUser = isCurrentUserSME ? user : smeUser;
  
  // If no SME user logged in, show SME login
  if (!effectiveSMEUser) {
    return <SMELoginPage onLogin={setSmeUser} />;
  }
  
  return (
    <div>
      <div className="bg-slate-950 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-brand hover:text-white"
          >
            ← Back to Verse Editor
          </button>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-400">
              SME: {effectiveSMEUser?.email}
            </div>
            {!isCurrentUserSME && (
              <button
                onClick={() => setSmeUser(null)}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-rose-600 hover:text-rose-300"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </div>
      <SMEDashboard user={effectiveSMEUser} />
    </div>
  );
}
