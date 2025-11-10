import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient, formatError } from "../lib/apiClient";
import { ReviewState, WorkSummary } from "../lib/types";

interface VerseDetail {
  verse_id: string;
  work_id: string;
  number_manual?: string;
  order: number;
  texts: Record<string, string | null>;
  segments: Record<string, string[]>;
  tags: string[];
  origin: Array<{
    edition: string;
    page?: number;
    para_index?: number;
  }>;
  review: {
    state: ReviewState;
    required_reviewers: string[];
    history: Array<{
      ts: string;
      actor: string;
      action: string;
      from?: string;
      to?: string;
      issues?: Array<{
        path?: string;
        lang?: string;
        problem?: string;
        found?: string;
        expected?: string;
        suggestion?: string;
        severity?: string;
      }>;
    }>;
  };
  meta?: Record<string, string | null>;
}

interface SMEVerseEditorProps {
  workId: string;
  verseId: string;
  onClose: () => void;
  onSave?: () => void;
}

const LANGUAGES = ['bn', 'en', 'or', 'hi', 'as'];

export function SMEVerseEditor({ workId, verseId, onClose, onSave }: SMEVerseEditorProps) {
  const { user } = useAuth();
  const [verse, setVerse] = useState<VerseDetail | null>(null);
  const [work, setWork] = useState<WorkSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'segments' | 'review' | 'history'>('content');
  
  // Form states
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [segments, setSegments] = useState<Record<string, string[]>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [reviewAction, setReviewAction] = useState("");
  const [reviewIssues, setReviewIssues] = useState("");

  const isSME = user?.roles?.includes("sme") || user?.roles?.includes("platform_admin") || user?.roles?.includes("admin");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [verseResponse, workResponse] = await Promise.all([
        apiClient.get<VerseDetail>(`/works/${workId}/verses/${verseId}`),
        apiClient.get<WorkSummary>(`/works/${workId}`)
      ]);
      
      setVerse(verseResponse.data);
      setWork(workResponse.data);
      
      // Initialize form states
      setTexts(Object.fromEntries(
        Object.entries(verseResponse.data.texts).map(([lang, text]) => [lang, text || ""])
      ));
      setSegments(verseResponse.data.segments || {});
      setTags(verseResponse.data.tags || []);
    } catch (error) {
      setError(formatError(error));
    } finally {
      setLoading(false);
    }
  }, [workId, verseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveContent = async () => {
    if (!verse) return;
    
    try {
      setSaving(true);
      await apiClient.put(`/works/${workId}/verses/${verseId}`, {
        texts,
        tags,
        segments
      });
      await loadData();
      onSave?.();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSegments = async () => {
    try {
      setSaving(true);
      await apiClient.put("/sme/segments", {
        work_id: workId,
        verse_id: verseId,
        segments
      });
      await loadData();
      onSave?.();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleReviewAction = async () => {
    if (!reviewAction || !verse) return;
    
    try {
      setSaving(true);
      const endpoint = `/review/verse/${verseId}/${reviewAction}`;
      const payload: any = { work_id: workId };
      
      if (reviewAction === 'reject' && reviewIssues) {
        payload.issues = [{ problem: reviewIssues }];
      }
      
      await apiClient.post(endpoint, payload);
      await loadData();
      setReviewAction("");
      setReviewIssues("");
      onSave?.();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addSegment = (lang: string) => {
    setSegments(prev => ({
      ...prev,
      [lang]: [...(prev[lang] || []), ""]
    }));
  };

  const updateSegment = (lang: string, index: number, value: string) => {
    setSegments(prev => ({
      ...prev,
      [lang]: prev[lang]?.map((seg, i) => i === index ? value : seg) || []
    }));
  };

  const removeSegment = (lang: string, index: number) => {
    setSegments(prev => ({
      ...prev,
      [lang]: prev[lang]?.filter((_, i) => i !== index) || []
    }));
  };

  if (!isSME) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Access Denied</h3>
          <p className="text-slate-400 mb-4">You don't have SME permissions to edit verses.</p>
          <button
            onClick={onClose}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-2 sm:px-4">
      <div className="w-full max-w-full sm:max-w-6xl max-h-[95vh] sm:max-h-[90vh] rounded-lg border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-semibold text-slate-100">
              SME Verse Editor - {verse?.number_manual || verseId}
            </h3>
            <p className="text-xs text-slate-400 sm:text-sm">
              {work?.title.en || work?.title.bn || workId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="self-end text-slate-400 transition hover:text-white"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto mb-4"></div>
            <p className="text-slate-400">Loading verse...</p>
          </div>
        ) : verse ? (
          <div className="flex flex-col h-full max-h-[calc(95vh-72px)] sm:max-h-[calc(90vh-80px)]">
            {/* Tabs */}
            <div className="border-b border-slate-800 px-4 sm:px-6">
              <nav className="flex flex-wrap gap-2 sm:space-x-8">
                {[
                  { key: 'content', label: 'Content & Tags' },
                  { key: 'segments', label: 'Segments' },
                  { key: 'review', label: 'Review Actions' },
                  { key: 'history', label: 'History' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`py-2 px-1 border-b-2 text-xs font-medium sm:text-sm ${
                      activeTab === tab.key
                        ? 'border-brand text-brand'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {error && (
              <div className="mx-4 mt-4 sm:mx-6 rounded-md border border-rose-700 bg-rose-950/40 px-3 py-2 text-xs text-rose-200 sm:px-4 sm:py-3 sm:text-sm">
                {error}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {activeTab === 'content' && (
                <ContentTab
                  texts={texts}
                  onTextsChange={setTexts}
                  tags={tags}
                  onTagsChange={setTags}
                  newTag={newTag}
                  onNewTagChange={setNewTag}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                  languages={LANGUAGES}
                />
              )}

              {activeTab === 'segments' && (
                <SegmentsTab
                  segments={segments}
                  onSegmentsChange={setSegments}
                  onAddSegment={addSegment}
                  onUpdateSegment={updateSegment}
                  onRemoveSegment={removeSegment}
                  languages={LANGUAGES}
                />
              )}

              {activeTab === 'review' && (
                <ReviewTab
                  verse={verse}
                  reviewAction={reviewAction}
                  onReviewActionChange={setReviewAction}
                  reviewIssues={reviewIssues}
                  onReviewIssuesChange={setReviewIssues}
                  onExecuteAction={handleReviewAction}
                  saving={saving}
                />
              )}

              {activeTab === 'history' && (
                <HistoryTab history={verse.review.history} />
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-800 px-4 py-3 sm:px-6 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-400 sm:text-sm">
                Current State: <span className={`px-2 py-1 rounded text-xs ${
                  verse.review.state === ('approved' as ReviewState) ? 'bg-emerald-500/20 text-emerald-300' :
                  verse.review.state === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                  verse.review.state === 'flagged' ? 'bg-orange-500/20 text-orange-300' :
                  'bg-slate-500/20 text-slate-300'
                }`}>
                  {verse.review.state.replace('_', ' ')}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <button
                  onClick={onClose}
                  className="rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white sm:text-sm"
                >
                  Close
                </button>
                {(activeTab === 'content' || activeTab === 'segments') && (
                  <button
                    onClick={activeTab === 'content' ? handleSaveContent : handleUpdateSegments}
                    disabled={saving}
                    className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-light disabled:opacity-50 sm:text-sm"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 sm:p-12 text-center">
            <p className="text-slate-400">Verse not found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ContentTab({
  texts,
  onTextsChange,
  tags,
  onTagsChange,
  newTag,
  onNewTagChange,
  onAddTag,
  onRemoveTag,
  languages
}: {
  texts: Record<string, string>;
  onTextsChange: (texts: Record<string, string>) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  newTag: string;
  onNewTagChange: (tag: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  languages: string[];
}) {
  const updateText = (lang: string, value: string) => {
    onTextsChange({ ...texts, [lang]: value });
  };

  return (
    <div className="space-y-6">
      {/* Text Content */}
      <div>
        <h4 className="text-lg font-semibold text-white mb-4">Text Content</h4>
        <div className="space-y-4">
          {languages.map(lang => (
            <div key={lang}>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                {lang.toUpperCase()}
              </label>
              <textarea
                value={texts[lang] || ""}
                onChange={(e) => updateText(lang, e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
                placeholder={`Enter text in ${lang.toUpperCase()}...`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <h4 className="text-lg font-semibold text-white mb-4">Tags</h4>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => onNewTagChange(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onAddTag()}
              placeholder="Add new tag..."
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
            />
            <button
              onClick={onAddTag}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-brand/20 px-3 py-1 text-sm text-brand-light"
              >
                {tag}
                <button
                  onClick={() => onRemoveTag(tag)}
                  className="text-brand-light hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentsTab({
  segments,
  onSegmentsChange,
  onAddSegment,
  onUpdateSegment,
  onRemoveSegment,
  languages
}: {
  segments: Record<string, string[]>;
  onSegmentsChange: (segments: Record<string, string[]>) => void;
  onAddSegment: (lang: string) => void;
  onUpdateSegment: (lang: string, index: number, value: string) => void;
  onRemoveSegment: (lang: string, index: number) => void;
  languages: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold text-white mb-4">Text Segments</h4>
        <p className="text-sm text-slate-400 mb-6">
          Break down text into smaller segments for better analysis and translation alignment.
        </p>
      </div>

      {languages.map(lang => (
        <div key={lang} className="border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h5 className="font-medium text-white">{lang.toUpperCase()}</h5>
            <button
              onClick={() => onAddSegment(lang)}
              className="text-sm text-brand hover:text-brand-light"
            >
              + Add Segment
            </button>
          </div>
          
          <div className="space-y-3">
            {(segments[lang] || []).map((segment, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={segment}
                  onChange={(e) => onUpdateSegment(lang, index, e.target.value)}
                  placeholder={`Segment ${index + 1}...`}
                  className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
                />
                <button
                  onClick={() => onRemoveSegment(lang, index)}
                  className="text-rose-400 hover:text-rose-300 px-2"
                >
                  ×
                </button>
              </div>
            ))}
            {(!segments[lang] || segments[lang].length === 0) && (
              <p className="text-sm text-slate-500 italic">No segments defined</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewTab({
  verse,
  reviewAction,
  onReviewActionChange,
  reviewIssues,
  onReviewIssuesChange,
  onExecuteAction,
  saving
}: {
  verse: VerseDetail;
  reviewAction: string;
  onReviewActionChange: (action: string) => void;
  reviewIssues: string;
  onReviewIssuesChange: (issues: string) => void;
  onExecuteAction: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold text-white mb-4">Review Actions</h4>
        <p className="text-sm text-slate-400 mb-6">
          Current state: <span className="font-medium text-white">{verse.review.state.replace('_', ' ')}</span>
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Action</label>
          <select
            value={reviewAction}
            onChange={(e) => onReviewActionChange(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
          >
            <option value="">Choose an action...</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="flag">Flag for Review</option>
            <option value="lock">Lock</option>
          </select>
        </div>

        {(reviewAction === 'reject' || reviewAction === 'flag') && (
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Issues/Comments {reviewAction === 'reject' ? '(Required)' : '(Optional)'}
            </label>
            <textarea
              value={reviewIssues}
              onChange={(e) => onReviewIssuesChange(e.target.value)}
              rows={3}
              placeholder="Describe the issues or provide comments..."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
            />
          </div>
        )}

        <button
          onClick={onExecuteAction}
          disabled={!reviewAction || saving || (reviewAction === 'reject' && !reviewIssues.trim())}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Processing...' : `Execute ${reviewAction}`}
        </button>
      </div>
    </div>
  );
}

function HistoryTab({ history }: { history: VerseDetail['review']['history'] }) {
  return (
    <div className="space-y-6">
      <h4 className="text-lg font-semibold text-white">Review History</h4>
      
      <div className="space-y-4">
        {history.map((entry, index) => (
          <div key={index} className="border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-white">
                {entry.action.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
              <div className="text-xs text-slate-400">
                {new Date(entry.ts).toLocaleString()}
              </div>
            </div>
            
            <div className="text-sm text-slate-300 mb-2">
              By: {entry.actor}
            </div>
            
            {entry.from && entry.to && (
              <div className="text-sm text-slate-400 mb-2">
                State changed from <span className="text-slate-200">{entry.from}</span> to <span className="text-slate-200">{entry.to}</span>
              </div>
            )}
            
            {entry.issues && entry.issues.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium text-slate-200 mb-2">Issues:</div>
                <div className="space-y-2">
                  {entry.issues.map((issue, issueIndex) => (
                    <div key={issueIndex} className="bg-slate-800 rounded p-3 text-sm">
                      {issue.problem && (
                        <div className="text-rose-300">Problem: {issue.problem}</div>
                      )}
                      {issue.suggestion && (
                        <div className="text-emerald-300">Suggestion: {issue.suggestion}</div>
                      )}
                      {issue.severity && (
                        <div className="text-orange-300">Severity: {issue.severity}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {history.length === 0 && (
          <p className="text-slate-400 italic">No review history available</p>
        )}
      </div>
    </div>
  );
}