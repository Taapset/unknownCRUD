import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, formatError } from "../lib/apiClient";
import { WorkSummary, VerseListItem } from "../lib/types";

interface VersesResponse {
  items: VerseListItem[];
  next?: {
    offset?: number | null;
    limit?: number | null;
  } | null;
}

interface SMEExportManagerProps {
  works: WorkSummary[];
}

type DownloadKind = "book" | "verse" | "all";

export function SMEExportManager({ works }: SMEExportManagerProps) {
  const [selectedWorkId, setSelectedWorkId] = useState<string>("");
  const [verses, setVerses] = useState<VerseListItem[]>([]);
  const [versesLoading, setVersesLoading] = useState<boolean>(false);
  const [selectedVerseId, setSelectedVerseId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState<Record<DownloadKind, boolean>>({
    book: false,
    verse: false,
    all: false,
  });

  useEffect(() => {
    if (works.length > 0 && !selectedWorkId) {
      setSelectedWorkId(works[0].work_id);
    }
  }, [works, selectedWorkId]);

  const loadVerses = useCallback(async (workId: string) => {
    setVersesLoading(true);
    setError(null);
    const aggregated: VerseListItem[] = [];
    let offset = 0;
    const limit = 100;
    try {
      while (true) {
        const response = await apiClient.get<VersesResponse>(
          `/works/${workId}/verses`,
          { params: { offset, limit } },
        );
        const pageItems = response.data.items || [];
        aggregated.push(...pageItems);
        const nextCursor = response.data.next;
        if (nextCursor && typeof nextCursor.offset === "number") {
          if (nextCursor.offset === offset) {
            break;
          }
          offset = nextCursor.offset;
        } else {
          break;
        }
      }
      setVerses(aggregated);
    } catch (err) {
      setError(formatError(err));
      setVerses([]);
    } finally {
      setVersesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWorkId) {
      setSelectedVerseId("");
      loadVerses(selectedWorkId);
    } else {
      setVerses([]);
    }
  }, [selectedWorkId, loadVerses]);

  const handleWorkChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedWorkId(event.target.value);
  };

  const updateDownloadLoading = (kind: DownloadKind, value: boolean) => {
    setDownloadLoading((prev) => ({ ...prev, [kind]: value }));
  };

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const currentWork = useMemo(
    () => works.find((work) => work.work_id === selectedWorkId) || null,
    [selectedWorkId, works],
  );

  const currentWorkLabel = currentWork
    ? currentWork.title.en || currentWork.title.bn || currentWork.work_id
    : "";

  const handleBookDownload = async () => {
    if (!selectedWorkId) {
      setError("Select a book to download.");
      return;
    }
    updateDownloadLoading("book", true);
    setError(null);
    setInfoMessage(null);
    try {
      const { data } = await apiClient.get(`/sme/export/work/${selectedWorkId}`, {
        params: { format: "clean" },
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${selectedWorkId}-book-clean-${timestamp}.json`;
      downloadJson(data, filename);
      setInfoMessage(`Downloaded book data for ${currentWorkLabel}.`);
    } catch (err) {
      setError(formatError(err));
    } finally {
      updateDownloadLoading("book", false);
    }
  };

  const handleVerseDownload = async () => {
    if (!selectedWorkId || !selectedVerseId) {
      setError("Select both a book and a verse to download.");
      return;
    }
    updateDownloadLoading("verse", true);
    setError(null);
    setInfoMessage(null);
    try {
      const { data } = await apiClient.get(
        `/sme/export/work/${selectedWorkId}/verse/${selectedVerseId}`,
        { params: { format: "clean" } },
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${selectedWorkId}-${selectedVerseId}-clean-${timestamp}.json`;
      downloadJson(data, filename);
      setInfoMessage(`Downloaded verse ${selectedVerseId}.`);
    } catch (err) {
      setError(formatError(err));
    } finally {
      updateDownloadLoading("verse", false);
    }
  };

  const handleAllDownload = async () => {
    updateDownloadLoading("all", true);
    setError(null);
    setInfoMessage(null);
    try {
      const { data } = await apiClient.get(`/sme/export/all`, {
        params: { format: "clean" },
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `library-all-clean-${timestamp}.json`;
      downloadJson(data, filename);
      setInfoMessage("Downloaded full library export.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      updateDownloadLoading("all", false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Select Book</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <select
            value={selectedWorkId}
            onChange={handleWorkChange}
            className="w-full sm:w-72 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
          >
            {works.length === 0 && <option value="">No books available</option>}
            {works.map((work) => (
              <option key={work.work_id} value={work.work_id}>
                {work.title.en || work.title.bn || work.work_id}
              </option>
            ))}
          </select>
          {currentWork && (
            <span className="text-sm text-slate-400">
              Languages: {currentWork.langs.join(", ")}
            </span>
          )}
        </div>
      </div>

      {(error || infoMessage) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            error
              ? "border-rose-700 bg-rose-950/40 text-rose-200"
              : "border-emerald-700 bg-emerald-950/40 text-emerald-200"
          }`}
        >
          {error ?? infoMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Download Book</h3>
          <p className="text-sm text-slate-400 mb-4">
            Exports the selected book with all verses and commentary in the clean JSON format.
          </p>
          <button
            onClick={handleBookDownload}
            disabled={!selectedWorkId || downloadLoading.book}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadLoading.book ? "Preparing..." : "Download Book JSON"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Download Verse</h3>
          <p className="text-sm text-slate-400 mb-4">
            Export a single verse with its commentary in the clean JSON format.
          </p>
          <div className="space-y-3">
            <select
              value={selectedVerseId}
              onChange={(event) => setSelectedVerseId(event.target.value)}
              disabled={!selectedWorkId || versesLoading}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
            >
              <option value="">
                {versesLoading
                  ? "Loading verses..."
                  : "Select a verse"}
              </option>
              {verses.map((verse) => (
                <option key={verse.verse_id} value={verse.verse_id}>
                  {verse.number_manual || verse.verse_id}
                </option>
              ))}
            </select>
            <button
              onClick={handleVerseDownload}
              disabled={!selectedVerseId || downloadLoading.verse}
              className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadLoading.verse ? "Preparing..." : "Download Verse JSON"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Download All Data</h3>
          <p className="text-sm text-slate-400 mb-4">
            Generate a complete clean export covering every book, verse, and commentary.
          </p>
          <button
            onClick={handleAllDownload}
            disabled={downloadLoading.all}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadLoading.all ? "Preparing..." : "Download Full Library"}
          </button>
        </div>
      </div>
    </div>
  );
}

