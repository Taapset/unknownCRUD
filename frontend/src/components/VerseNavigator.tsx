import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ReviewState, VerseListItem } from "../lib/types";

interface VerseNavigatorProps {
  items: VerseListItem[];
  loading: boolean;
  total: number;
  offset: number;
  limit: number;
  searchTerm: string;
  onSearch: (term: string) => void;
  onSelect: (verseId: string | null) => void;
  selectedVerseId?: string;
  onPageChange: (offset: number) => void;
  onCreateNew: () => void;
}

const STATE_COLORS: Record<ReviewState, string> = {
  draft: "bg-slate-700 text-slate-100",
  submitted: "bg-blue-500/80 text-blue-950",
  review_pending: "bg-amber-500/80 text-amber-950",
  reviewer_approved: "bg-green-500/80 text-green-950",
  admin_approved: "bg-emerald-600/80 text-emerald-950",
  sme_approved: "bg-emerald-500/80 text-emerald-950",
  locked: "bg-slate-500/80 text-slate-100",
  rejected: "bg-rose-500/80 text-rose-50",
  flagged: "bg-orange-500/80 text-orange-950",
  sme_rollback: "bg-purple-600/80 text-purple-950",
};

export function VerseNavigator({
  items,
  loading,
  total,
  offset,
  limit,
  searchTerm,
  onSearch,
  onSelect,
  selectedVerseId,
  onPageChange,
  onCreateNew,
}: VerseNavigatorProps) {
  const [localSearch, setLocalSearch] = useState(searchTerm);

  const pageInfo = useMemo(() => {
    if (!total) {
      return "0 of 0";
    }
    const start = offset + 1;
    const end = Math.min(offset + limit, total);
    const page = Math.floor(offset / limit) + 1;
    const pageCount = Math.ceil(total / limit);
    return `${start}-${end} of ${total} • Page ${page}/${pageCount}`;
  }, [offset, limit, total]);

  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(localSearch.trim());
  };

  return (
    <aside className="w-full max-h-[calc(100vh-16rem)] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-200 shadow-inner shadow-black/30 sm:p-4 lg:w-72 lg:max-h-[calc(100vh-12rem)]">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h3 className="text-sm font-semibold text-slate-100 sm:text-base">Verses</h3>
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded-md border border-brand/60 bg-brand/10 px-2 py-1 text-xs font-semibold text-brand-light transition hover:border-brand hover:bg-brand/20 hover:text-white"
        >
          + New
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mb-3 sm:mb-4">
        <label className="sr-only" htmlFor="verse-search">
          Search verses
        </label>
        <input
          id="verse-search"
          type="search"
          placeholder="Search verse…"
          value={localSearch}
          onChange={(event) => setLocalSearch(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm focus:border-brand focus:outline-none sm:px-3 sm:py-2"
        />
      </form>

      <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
        <span>{pageInfo}</span>
        {loading && <span className="text-brand-light">Loading…</span>}
      </div>

      <ul className="space-y-1.5 sm:space-y-2 max-h-64 overflow-y-auto pr-1">
        {items.map((item) => {
          const isActive = item.verse_id === selectedVerseId;
          const state = item.review?.state ?? "draft";
          return (
            <li key={item.verse_id}>
              <button
                type="button"
                onClick={() => onSelect(item.verse_id)}
                className={`w-full rounded-lg border px-2 py-1.5 text-left transition sm:px-3 sm:py-2 ${
                  isActive
                    ? "border-brand bg-brand/10 text-white"
                    : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-brand/60 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold truncate pr-2">
                    {item.number_manual ?? item.verse_id}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase flex-shrink-0 ${STATE_COLORS[state]}`}
                  >
                    {state.replace("_", " ")}
                  </span>
                </div>
                {item.texts?.bn && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {item.texts.bn}
                  </p>
                )}
              </button>
            </li>
          );
        })}
        {!loading && items.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-3 py-4 text-center text-xs text-slate-500">
            No verses found.
          </li>
        )}
      </ul>

      <div className="mt-3 flex items-center justify-between sm:mt-4">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(offset - limit, 0))}
          disabled={offset === 0 || loading}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-brand hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(offset + limit)}
          disabled={offset + limit >= total || loading}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-brand hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
        >
          Next
        </button>
      </div>
    </aside>
  );
}
