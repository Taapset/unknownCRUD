import { useMemo, useState } from "react";
import {
  AttachmentRef,
  CommentaryEntry,
  CommentaryFormData,
  OriginEntry,
  ReviewHistoryEntry,
  ReviewHistoryIssue,
  ReviewState,
  SourceEdition,
} from "../lib/types";

export interface TranslationsTabProps {
  languages: string[];
  canonicalLang: string;
  texts: Record<string, string>;
  onChange: (lang: string, value: string) => void;
}

export function TranslationsTab({
  languages,
  canonicalLang,
  texts,
  onChange,
}: TranslationsTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {languages.map((lang) => {
        const value = texts[lang] ?? "";
        return (
          <div
            key={lang}
            className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor={`translations-${lang}`}
                className="text-sm font-semibold uppercase tracking-wide text-slate-200"
              >
                {lang}
                {lang === canonicalLang && (
                  <span className="ml-2 rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-brand-light">
                    Canonical
                  </span>
                )}
              </label>
              <span className="text-xs text-slate-500">{value.length} chars</span>
            </div>
            <textarea
              id={`translations-${lang}`}
              value={value}
              onChange={(event) => onChange(lang, event.target.value)}
              className="min-h-[6rem] rounded-lg border border-slate-700 bg-black/30 p-3 text-sm text-slate-100 focus:border-brand focus:outline-none"
              placeholder={`Enter ${lang} translation…`}
            />
          </div>
        );
      })}
    </div>
  );
}

export interface SegmentsTabProps {
  languages: string[];
  segments: Record<string, string[]>;
  texts: Record<string, string>;
  onChange: (lang: string, next: string[]) => void;
}

export function SegmentsTab({
  languages,
  segments,
  texts,
  onChange,
}: SegmentsTabProps) {
  const handleSplit = (lang: string, index: number) => {
    const current = segments[lang] ?? [];
    const value = current[index] ?? "";
    const pieces = value.includes("\n")
      ? value.split("\n").map((entry) => entry.trim()).filter(Boolean)
      : value
          .split(/(?<=[.?!])\s+/)
          .map((entry) => entry.trim())
          .filter(Boolean);
    if (pieces.length <= 1) {
      return;
    }
    const next = [...current.slice(0, index), ...pieces, ...current.slice(index + 1)];
    onChange(lang, next);
  };

  const handleMerge = (lang: string, index: number) => {
    const current = segments[lang] ?? [];
    if (index >= current.length - 1) {
      return;
    }
    const merged = `${current[index]} ${current[index + 1]}`.trim();
    const next = [...current];
    next.splice(index, 2, merged);
    onChange(lang, next);
  };

  const handleReorder = (lang: string, index: number, direction: -1 | 1) => {
    const current = segments[lang] ?? [];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) {
      return;
    }
    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    onChange(lang, next);
  };

  const handleInsert = (lang: string, index: number) => {
    const current = segments[lang] ?? [];
    const next = [...current];
    next.splice(index + 1, 0, "");
    onChange(lang, next);
  };

  const handleRemove = (lang: string, index: number) => {
    const current = segments[lang] ?? [];
    const next = [...current];
    next.splice(index, 1);
    onChange(lang, next);
  };

  return (
    <div className="flex flex-col gap-6">
      {languages.map((lang) => {
        const languageSegments = segments[lang] ?? [];
        const baseText = texts[lang] ?? "";
        return (
          <div
            key={lang}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
                {lang} Segments
              </h3>
              <button
                type="button"
                onClick={() => onChange(lang, [...languageSegments, ""])}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-brand hover:text-white"
              >
                + Add Segment
              </button>
            </div>

            {!languageSegments.length && (
              <p className="text-xs text-slate-500">
                No segments defined. Use “Add Segment” to start or click “Autofill from text”.
              </p>
            )}

            {languageSegments.map((segment, index) => (
              <div
                key={`${lang}-${index}`}
                className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"
              >
                <textarea
                  value={segment}
                  onChange={(event) => {
                    const next = [...languageSegments];
                    next[index] = event.target.value;
                    onChange(lang, next);
                  }}
                  className="w-full rounded-md border border-slate-700 bg-black/40 p-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  placeholder={`Segment ${index + 1}`}
                />
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>{segment.length} chars</span>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleReorder(lang, index, -1)}
                      className="rounded border border-slate-700 px-2 py-1 hover:border-brand"
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(lang, index, 1)}
                      className="rounded border border-slate-700 px-2 py-1 hover:border-brand"
                      disabled={index === languageSegments.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSplit(lang, index)}
                      className="rounded border border-slate-700 px-2 py-1 hover:border-brand"
                    >
                      Split
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMerge(lang, index)}
                      className="rounded border border-slate-700 px-2 py-1 hover:border-brand"
                      disabled={index === languageSegments.length - 1}
                    >
                      Merge ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsert(lang, index)}
                      className="rounded border border-slate-700 px-2 py-1 hover:border-brand"
                    >
                      + Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(lang, index)}
                      className="rounded border border-rose-700 px-2 py-1 text-rose-300 hover:border-rose-500"
                    >
                      ✕ Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                const newSegments = baseText
                  .split(/(?<=[.?!])\s+/)
                  .map((entry) => entry.trim())
                  .filter(Boolean);
                if (newSegments.length) {
                  onChange(lang, newSegments);
                }
              }}
              className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-brand hover:text-white"
            >
              Autofill from {lang} text
            </button>
          </div>
        );
      })}
    </div>
  );
}

export interface OriginTabProps {
  origin: OriginEntry[];
  editions: SourceEdition[];
  onAdd: () => void;
  onUpdate: (index: number, update: Partial<OriginEntry>) => void;
  onRemove: (index: number) => void;
}

export function OriginTab({
  origin,
  editions,
  onAdd,
  onUpdate,
  onRemove,
}: OriginTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Source references</h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-brand hover:text-white"
        >
          + Add Origin
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
          <thead className="bg-slate-900/40 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Edition</th>
              <th className="px-3 py-2 text-left">Page</th>
              <th className="px-3 py-2 text-left">Paragraph</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {origin.map((entry, index) => (
              <tr key={`origin-${index}`} className="bg-slate-950/40">
                <td className="px-3 py-2">
                  <select
                    value={entry.edition}
                    onChange={(event) =>
                      onUpdate(index, { edition: event.target.value })
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm focus:border-brand focus:outline-none"
                  >
                    <option value="">Select edition…</option>
                    {editions.map((edition) => (
                      <option key={edition.id} value={edition.id}>
                        {edition.id}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={entry.page ?? ""}
                    onChange={(event) =>
                      onUpdate(index, {
                        page:
                          event.target.value.length === 0
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                    className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm focus:border-brand focus:outline-none"
                    placeholder="Pg"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={entry.para_index ?? ""}
                    onChange={(event) =>
                      onUpdate(index, {
                        para_index:
                          event.target.value.length === 0
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                    className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm focus:border-brand focus:outline-none"
                    placeholder="Paragraph"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="rounded-md border border-rose-700 px-2 py-1 text-xs text-rose-300 transition hover:border-rose-500"
                  >
                    ✕ Remove
                  </button>
                </td>
              </tr>
            ))}
            {!origin.length && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-xs text-slate-500"
                >
                  No origin references yet. Add at least one before approval.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface CommentaryTabProps {
  verseId?: string;
  languages: string[];
  entries: CommentaryEntry[];
  loading: boolean;
  onCreate: (payload: CommentaryFormData) => Promise<void>;
  onDuplicate: (commentaryId: string, targetVerseId: string) => Promise<void>;
}

export function CommentaryTab({
  verseId,
  languages,
  entries,
  loading,
  onCreate,
  onDuplicate,
}: CommentaryTabProps) {
  const [isCreating, setCreating] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newNote, setNewNote] = useState<CommentaryFormData>({
    speaker: undefined,
    source: undefined,
    genre: undefined,
    tags: [],
    texts: Object.fromEntries(languages.map((lang) => [lang, ""])),
    targets: verseId ? [{ kind: "verse", ids: [verseId] }] : [],
  });

  const resetForm = () => {
    setNewNote({
      speaker: undefined,
      source: undefined,
      genre: undefined,
      tags: [],
      texts: Object.fromEntries(languages.map((lang) => [lang, ""])),
      targets: verseId ? [{ kind: "verse", ids: [verseId] }] : [],
    });
    setTagDraft("");
    setCreating(false);
  };

  const addTag = () => {
    const next = tagDraft.trim();
    if (!next) {
      return;
    }
    setNewNote((prev) => ({
      ...prev,
      tags: Array.from(new Set([...(prev.tags ?? []), next])),
    }));
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    setNewNote((prev) => ({
      ...prev,
      tags: (prev.tags ?? []).filter((item) => item !== tag),
    }));
  };

  const handleSubmit = async () => {
    if (!verseId) {
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        ...newNote,
        texts: Object.fromEntries(
          languages.map((lang) => [lang, newNote.texts?.[lang] ?? ""]),
        ),
        targets: [{ kind: "verse", ids: [verseId] }],
      });
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Commentary linked to verse {verseId ?? "…"}
        </h3>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-brand hover:text-white"
          disabled={!verseId}
        >
          {isCreating ? "Cancel" : "Add Note"}
        </button>
      </div>

      {isCreating && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-slate-400">Speaker</label>
              <input
                value={newNote.speaker ?? ""}
                onChange={(event) =>
                  setNewNote((prev) => ({ ...prev, speaker: event.target.value }))
                }
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-slate-400">Source</label>
              <input
                value={newNote.source ?? ""}
                onChange={(event) =>
                  setNewNote((prev) => ({ ...prev, source: event.target.value }))
                }
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-slate-400">Genre</label>
              <input
                value={newNote.genre ?? ""}
                onChange={(event) =>
                  setNewNote((prev) => ({ ...prev, genre: event.target.value }))
                }
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs uppercase text-slate-400">Tags</label>
            <div className="mt-2 flex flex-wrap gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
              {(newNote.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200"
                >
                  {tag}
                  <button
                    type="button"
                    className="text-slate-400 transition hover:text-rose-300"
                    onClick={() => removeTag(tag)}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1 min-w-[6rem] bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                placeholder="Add tag"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {languages.map((lang) => (
              <div key={`commentary-text-${lang}`} className="flex flex-col gap-2">
                <label className="text-xs uppercase text-slate-400">
                  {lang.toUpperCase()} Text
                </label>
                <textarea
                  value={newNote.texts?.[lang] ?? ""}
                  onChange={(event) =>
                    setNewNote((prev) => ({
                      ...prev,
                      texts: {
                        ...(prev.texts ?? {}),
                        [lang]: event.target.value,
                      },
                    }))
                  }
                  className="min-h-[5rem] rounded-md border border-slate-700 bg-black/30 p-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-slate-700 px-4 py-2 text-slate-300 transition hover:border-slate-500 hover:text-white"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:bg-slate-600"
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Create Commentary"}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-400">
          Loading commentary…
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.commentary_id}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
          >
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="font-semibold">{entry.speaker ?? "Unknown speaker"}</span>
              {entry.source && (
                <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {entry.source}
                </span>
              )}
              {entry.genre && (
                <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {entry.genre}
                </span>
              )}
              <span className="ml-auto text-xs text-slate-500">
                {entry.review?.state ?? "review_pending"}
              </span>
            </div>

            {(entry.tags?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                {entry.tags?.map((tag) => (
                  <span
                    key={`${entry.commentary_id}-tag-${tag}`}
                    className="rounded-full bg-slate-800 px-2 py-1"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {languages.map((lang) => {
                const text = entry.texts?.[lang];
                if (!text || !text.trim()) {
                  return null;
                }
                return (
                  <p key={`${entry.commentary_id}-text-${lang}`}>
                    <span className="mr-2 text-xs uppercase text-slate-500">
                      {lang}:
                    </span>
                    {text}
                  </p>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const target = window.prompt(
                    "Duplicate to verse ID (e.g., V0002):",
                    entry.verse_id ?? "",
                  );
                  if (target) {
                    void onDuplicate(entry.commentary_id, target.trim());
                  }
                }}
                className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 transition hover:border-brand hover:text-white"
              >
                Duplicate to…
              </button>
            </div>
          </div>
        ))}
        {!loading && !entries.length && (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-4 text-center text-xs text-slate-500">
            No commentary linked to this verse yet.
          </div>
        )}
      </div>
    </div>
  );
}

export interface ReviewTabProps {
  status: ReviewState;
  requiredReviewers: string[];
  validationErrors: string[];
  canApprove: boolean;
  canReject: boolean;
  canFlag: boolean;
  canLock: boolean;
  isProcessing: boolean;
  onApprove: () => Promise<void>;
  onReject: (issues: ReviewHistoryIssue[]) => Promise<void>;
  onFlag: () => Promise<void>;
  onLock: () => Promise<void>;
  previewNumber?: string | null;
  previewTexts?: Record<string, string | null>;
}

export function ReviewTab({
  status,
  requiredReviewers,
  validationErrors,
  canApprove,
  canReject,
  canFlag,
  canLock,
  isProcessing,
  onApprove,
  onReject,
  onFlag,
  onLock,
  previewNumber,
  previewTexts,
}: ReviewTabProps) {
  const [issues, setIssues] = useState<ReviewHistoryIssue[]>([]);

  const updateIssue = (index: number, update: Partial<ReviewHistoryIssue>) => {
    setIssues((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...update };
      return next;
    });
  };

  const addIssue = () => {
    setIssues((prev) => [
      ...prev,
      {
        path: "",
        lang: "",
        problem: "",
        found: "",
        expected: "",
        suggestion: "",
        severity: "minor",
      },
    ]);
  };

  const removeIssue = (index: number) => {
    setIssues((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleReject = async () => {
    await onReject(
      issues
        .map((issue) => ({
          ...issue,
          path: issue.path?.trim() || undefined,
          lang: issue.lang?.trim() || undefined,
          problem: issue.problem?.trim() || undefined,
          found: issue.found?.trim() || undefined,
          expected: issue.expected?.trim() || undefined,
          suggestion: issue.suggestion?.trim() || undefined,
          severity: issue.severity ?? "minor",
        }))
        .filter((issue) => issue.problem),
    );
    setIssues([]);
  };

  return (
    <div className="flex flex-col gap-6">
      {previewTexts && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Verse Preview {previewNumber ? `— ${previewNumber}` : ""}
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(previewTexts).map(([lang, text]) => (
              <div
                key={`preview-${lang}`}
                className="rounded-lg border border-slate-800 bg-black/30 p-3"
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {lang}
                </div>
                <p className="text-sm text-slate-100 whitespace-pre-wrap">
                  {text?.trim() ? text : "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span className="font-semibold uppercase tracking-wide text-slate-100">
            Review State: {status.replace("_", " ")}
          </span>
          <span className="text-xs text-slate-500">
            Required reviewers: {requiredReviewers.join(", ") || "—"}
          </span>
        </div>

        {!!validationErrors.length && (
          <div className="mt-3 rounded-md border border-amber-700 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            <strong className="font-semibold">Validation warnings:</strong>
            <ul className="mt-1 list-disc pl-4">
              {validationErrors.map((warning, index) => (
                <li key={`validation-warning-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Issues</h3>
          <button
            type="button"
            onClick={addIssue}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-brand hover:text-white"
          >
            + Add issue
          </button>
        </div>
        <div className="space-y-3">
          {issues.map((issue, index) => (
            <div
              key={`issue-${index}`}
              className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <input
                  placeholder="JSON path (optional)"
                  value={issue.path ?? ""}
                  onChange={(event) =>
                    updateIssue(index, { path: event.target.value })
                  }
                  className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs focus:border-brand focus:outline-none"
                />
                <input
                  placeholder="Lang"
                  value={issue.lang ?? ""}
                  onChange={(event) =>
                    updateIssue(index, { lang: event.target.value })
                  }
                  className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs uppercase focus:border-brand focus:outline-none"
                />
                <select
                  value={issue.severity ?? "minor"}
                  onChange={(event) =>
                    updateIssue(index, { severity: event.target.value })
                  }
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs focus:border-brand focus:outline-none"
                >
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeIssue(index)}
                  className="ml-auto rounded-md border border-rose-700 px-2 py-1 text-rose-300 hover:border-rose-500"
                >
                  ✕ Remove
                </button>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <textarea
                  placeholder="Describe the problem"
                  value={issue.problem ?? ""}
                  onChange={(event) =>
                    updateIssue(index, { problem: event.target.value })
                  }
                  className="min-h-[4rem] rounded-md border border-slate-700 bg-black/30 p-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                />
                <textarea
                  placeholder="Found text"
                  value={issue.found ?? ""}
                  onChange={(event) =>
                    updateIssue(index, { found: event.target.value })
                  }
                  className="min-h-[4rem] rounded-md border border-slate-700 bg-black/30 p-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                />
                <textarea
                  placeholder="Expected text"
                  value={issue.expected ?? ""}
                  onChange={(event) =>
                    updateIssue(index, { expected: event.target.value })
                  }
                  className="min-h-[4rem] rounded-md border border-slate-700 bg-black/30 p-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                />
                <textarea
                  placeholder="Suggestion"
                  value={issue.suggestion ?? ""}
                  onChange={(event) =>
                    updateIssue(index, { suggestion: event.target.value })
                  }
                  className="min-h-[4rem] rounded-md border border-slate-700 bg-black/30 p-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                />
              </div>
            </div>
          ))}
          {!issues.length && (
            <p className="text-xs text-slate-500">
              No blocking issues provided. Add issues before rejecting.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onApprove()}
          disabled={!canApprove || isProcessing}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={!canReject || isProcessing}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => void onFlag()}
          disabled={!canFlag || isProcessing}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          Flag
        </button>
        <button
          type="button"
          onClick={() => void onLock()}
          disabled={!canLock || isProcessing}
          className="rounded-md bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          Lock
        </button>
      </div>
    </div>
  );
}

export interface HistoryTabProps {
  history: ReviewHistoryEntry[];
}

export function HistoryTab({ history }: HistoryTabProps) {
  const handleCopy = async (entry: ReviewHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn("Clipboard copy failed", error);
    }
  };

  return (
    <div className="space-y-3">
      {history.map((entry, index) => (
        <details
          key={`history-${index}`}
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm text-slate-200">
            <span className="font-semibold">
              {new Date(entry.ts).toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">@{entry.actor}</span>
            <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs uppercase text-slate-400">
              {entry.action}
            </span>
            {entry.from && entry.to && (
              <span className="text-xs text-slate-400">
                {entry.from} → {entry.to}
              </span>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {(entry.issues?.length ?? 0) || 0} issue(s)
            </span>
          </summary>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            {entry.issues?.length ? (
              <div className="space-y-2">
                {entry.issues.map((issue, idx) => (
                  <div
                    key={`history-${index}-issue-${idx}`}
                    className="rounded-md border border-slate-800 bg-slate-950/40 p-2"
                  >
                    <div className="flex flex-wrap gap-2 text-slate-400">
                      {issue.path && <span>path: {issue.path}</span>}
                      {issue.lang && <span>lang: {issue.lang}</span>}
                      {issue.severity && <span>severity: {issue.severity}</span>}
                    </div>
                    {issue.problem && (
                      <p className="text-slate-200">Problem: {issue.problem}</p>
                    )}
                    {issue.found && (
                      <p className="text-slate-400">Found: {issue.found}</p>
                    )}
                    {issue.expected && (
                      <p className="text-slate-400">Expected: {issue.expected}</p>
                    )}
                    {issue.suggestion && (
                      <p className="text-slate-400">Suggestion: {issue.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">No issues recorded.</p>
            )}
            <button
              type="button"
              onClick={() => void handleCopy(entry)}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-brand hover:text-white"
            >
              Copy entry JSON
            </button>
          </div>
        </details>
      ))}
      {!history.length && (
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-4 text-center text-xs text-slate-500">
          No review history yet.
        </div>
      )}
    </div>
  );
}

export interface PreviewTabProps {
  canonicalLang: string;
  languages: string[];
  texts: Record<string, string>;
  commentary: CommentaryEntry[];
}

export function PreviewTab({
  canonicalLang,
  languages,
  texts,
  commentary,
}: PreviewTabProps) {
  const fallbackOrder = useMemo(
    () => Array.from(new Set([canonicalLang, "bn", "en", "or", "hi", "as", ...languages])),
    [canonicalLang, languages],
  );

  const primaryText =
    fallbackOrder
      .map((lang) => texts[lang]?.trim())
      .find((value) => value && value.length) ?? "(No canonical text)";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-slate-100">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Verse Preview
        </h3>
        <p className="whitespace-pre-wrap text-base leading-relaxed">{primaryText}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {fallbackOrder.map((lang) => {
            if (lang === canonicalLang) {
              return null;
            }
            const text = texts[lang];
            if (!text || !text.trim()) {
              return null;
            }
            return (
              <div
                key={`preview-lang-${lang}`}
                className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300"
              >
                <h4 className="mb-1 text-xs uppercase text-slate-500">{lang}</h4>
                <p className="whitespace-pre-wrap">{text}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Commentary</h3>
        {commentary.map((entry) => (
          <details
            key={`preview-commentary-${entry.commentary_id}`}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
          >
            <summary className="cursor-pointer text-sm text-slate-200">
              {entry.speaker ?? "Commentary"}{" "}
              <span className="text-xs text-slate-500">
                {entry.source ?? entry.commentary_id}
              </span>
            </summary>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {fallbackOrder.map((lang) => {
                const text = entry.texts?.[lang];
                if (!text || !text.trim()) {
                  return null;
                }
                return (
                  <p key={`${entry.commentary_id}-preview-${lang}`}>
                    <span className="mr-2 text-xs uppercase text-slate-500">
                      {lang}:
                    </span>
                    {text}
                  </p>
                );
              })}
            </div>
          </details>
        ))}
        {!commentary.length && (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-4 text-center text-xs text-slate-500">
            No commentary to preview.
          </div>
        )}
      </div>
    </div>
  );
}

export interface AttachmentsTabProps {
  attachments: AttachmentRef[];
  onAdd: () => void;
  onUpdate: (index: number, update: Partial<AttachmentRef>) => void;
  onRemove: (index: number) => void;
}

export function AttachmentsTab({
  attachments,
  onAdd,
  onUpdate,
  onRemove,
}: AttachmentsTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Reference links & attachments
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-brand hover:text-white"
        >
          + Add Attachment
        </button>
      </div>

      <div className="space-y-3">
        {attachments.map((attachment, index) => (
          <div
            key={`attachment-${index}`}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-slate-400">Label</label>
                <input
                  value={attachment.label}
                  onChange={(event) =>
                    onUpdate(index, { label: event.target.value })
                  }
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  placeholder="Attachment label"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-slate-400">URL</label>
                <input
                  value={attachment.url}
                  onChange={(event) =>
                    onUpdate(index, { url: event.target.value })
                  }
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  placeholder="https://…"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <label className="text-xs uppercase text-slate-400">Notes</label>
              <textarea
                value={attachment.notes ?? ""}
                onChange={(event) =>
                  onUpdate(index, { notes: event.target.value })
                }
                className="min-h-[4rem] rounded-md border border-slate-700 bg-black/30 p-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
              />
            </div>
            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="rounded-md border border-rose-700 px-2 py-1 text-xs text-rose-300 transition hover:border-rose-500"
              >
                ✕ Remove
              </button>
            </div>
          </div>
        ))}
        {!attachments.length && (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-4 text-center text-xs text-slate-500">
            No attachments yet.
          </div>
        )}
      </div>
    </div>
  );
}
