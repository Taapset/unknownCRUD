import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient, formatError } from "../lib/apiClient";
import { ReviewState, WorkSummary } from "../lib/types";
import { SMEBookManager } from "./SMEBookManager";
import { SMEWorkManager } from "./SMEWorkManager";
import { SMEVerseManager } from "./SMEVerseManager";
import { SMEExportManager } from "./SMEExportManager";

interface SMEAnalytics {
  pending_reviews: number;
  approved_by_me: number;
  rejected_by_me: number;
  flagged_items: number;
  my_recent_activity: Array<{
    type: string;
    work_id: string;
    verse_id?: string;
    action: string;
    date: string;
  }>;
  work_progress: Record<string, Record<string, number>>;
}

interface PendingItem {
  type: "verse" | "commentary";
  work_id: string;
  work_title: Record<string, string>;
  item_id: string;
  verse_id?: string;
  number_manual?: string;
  state: ReviewState;
  texts: Record<string, string>;
  tags?: string[];
  speaker?: string;
  last_updated?: string;
}



const STATE_COLORS: Record<string, string> = {
  draft: "bg-slate-500/20 text-slate-300",
  review_pending: "bg-yellow-500/20 text-yellow-300",
  submitted: "bg-blue-500/20 text-blue-300",
  approved: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-rose-500/20 text-rose-300",
  flagged: "bg-orange-500/20 text-orange-300",
  locked: "bg-blue-500/20 text-blue-300",
};

export function SMEDashboard({ user: propUser }: { user?: any } = {}) {
  const { user: contextUser } = useAuth();
  const user = propUser || contextUser;
  const [analytics, setAnalytics] = useState<SMEAnalytics | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [selectedWork, setSelectedWork] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'pending' | 'works' | 'bulk' | 'books' | 'editor' | 'exports'>('overview');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("");
  const [bulkIssues, setBulkIssues] = useState<string>("");

  const isSME = user?.roles?.includes("sme") || user?.roles?.includes("platform_admin") || user?.roles?.includes("admin");



  const loadAnalytics = useCallback(async () => {
    try {
      const response = await apiClient.get<SMEAnalytics>("/sme/analytics");
      setAnalytics(response.data);
    } catch (error) {
      setError(formatError(error));
    }
  }, []);

  const loadPendingItems = useCallback(async (workId?: string) => {
    try {
      const params = workId ? { work_id: workId } : {};
      const response = await apiClient.get<{ items: PendingItem[]; total: number }>("/sme/pending-reviews", { params });
      setPendingItems(response.data.items);
    } catch (error) {
      setError(formatError(error));
    }
  }, []);

  const loadWorks = useCallback(async () => {
    try {
      const response = await apiClient.get<WorkSummary[]>("/works");
      setWorks(response.data);
    } catch (error) {
      setError(formatError(error));
    }
  }, []);



  useEffect(() => {
    if (isSME) {
      setLoading(true);
      Promise.all([
        loadAnalytics(),
        loadPendingItems(),
        loadWorks()
      ]).finally(() => setLoading(false));
    }
  }, [isSME, loadAnalytics, loadPendingItems, loadWorks]);

  useEffect(() => {
    if (selectedWork) {
      loadPendingItems(selectedWork);
    }
  }, [selectedWork, loadPendingItems]);

  const handleBulkAction = async () => {
    if (!selectedItems.size || !bulkAction || !selectedWork) return;

    try {
      const issues = bulkIssues ? [{ problem: bulkIssues }] : [];
      await apiClient.post("/sme/bulk-action", {
        work_id: selectedWork,
        verse_ids: Array.from(selectedItems),
        action: bulkAction,
        issues
      });
      
      setSelectedItems(new Set());
      setBulkAction("");
      setBulkIssues("");
      await loadPendingItems(selectedWork);
      await loadAnalytics();
    } catch (error) {
      setError(formatError(error));
    }
  };

  const handleItemAction = async (item: PendingItem, action: string) => {
    try {
      const endpoint = item.type === "verse" 
        ? `/review/verse/${item.item_id}/${action}`
        : `/review/commentary/${item.item_id}/${action}`;
      
      await apiClient.post(endpoint, { work_id: item.work_id });
      await loadPendingItems(selectedWork);
      await loadAnalytics();
    } catch (error) {
      setError(formatError(error));
    }
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  if (!user || !isSME) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400">You don't have SME permissions to access this dashboard.</p>
          <p className="text-xs text-slate-500 mt-2">User: {user?.email}, Roles: {user?.roles?.join(', ')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">SME Dashboard</h1>
          <div className="text-sm text-slate-400">
            Welcome, {user?.email}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-800">
          <nav className="flex space-x-4 sm:space-x-8">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'pending', label: 'Pending Reviews' },
              { key: 'works', label: 'Work Management' },
              { key: 'bulk', label: 'Bulk Actions' },
              { key: 'books', label: 'Book Management' },
              { key: 'editor', label: 'Verse Editor' },
              { key: 'exports', label: 'Data Export' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
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
          <div className="mb-6 rounded-md border border-rose-700 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto mb-4"></div>
            <p className="text-slate-400">Loading...</p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab analytics={analytics} />}
            {activeTab === 'pending' && (
              <PendingTab 
                items={pendingItems} 
                onItemAction={handleItemAction}
                selectedWork={selectedWork}
                works={works}
                onWorkChange={setSelectedWork}
              />
            )}
            {activeTab === 'works' && <SMEWorkManager />}
            {activeTab === 'bulk' && (
              <BulkActionsTab
                items={pendingItems.filter(item => item.type === 'verse')}
                selectedItems={selectedItems}
                onToggleItem={toggleItemSelection}
                bulkAction={bulkAction}
                onBulkActionChange={setBulkAction}
                bulkIssues={bulkIssues}
                onBulkIssuesChange={setBulkIssues}
                onExecute={handleBulkAction}
                selectedWork={selectedWork}
                works={works}
                onWorkChange={setSelectedWork}
              />
            )}
            {activeTab === 'books' && <SMEBookManager />}
            {activeTab === 'editor' && <SMEVerseManager />}
            {activeTab === 'exports' && (
              <SMEExportManager works={works} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ analytics }: { analytics: SMEAnalytics | null }) {
  if (!analytics) return <div className="text-slate-400">Loading analytics...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-yellow-400">{analytics.pending_reviews}</div>
          <div className="text-sm text-slate-400">Pending Reviews</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-emerald-400">{analytics.approved_by_me}</div>
          <div className="text-sm text-slate-400">Approved by Me</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-rose-400">{analytics.rejected_by_me}</div>
          <div className="text-sm text-slate-400">Rejected by Me</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-orange-400">{analytics.flagged_items}</div>
          <div className="text-sm text-slate-400">Flagged Items</div>
        </div>
      </div>

      {/* Work Progress */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Work Progress</h3>
        <div className="space-y-4">
          {Object.entries(analytics.work_progress).map(([workId, stats]) => (
            <div key={workId} className="border border-slate-700 rounded-lg p-4">
              <h4 className="font-medium text-white mb-2">{workId}</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                {Object.entries(stats).map(([state, count]) => (
                  <div key={state} className="text-center">
                    <div className="text-lg font-bold text-white">{count}</div>
                    <div className={`text-xs px-2 py-1 rounded ${STATE_COLORS[state] || 'bg-slate-500/20 text-slate-300'}`}>
                      {state.replace('_', ' ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">My Recent Activity</h3>
        <div className="space-y-3">
          {analytics.my_recent_activity.slice(0, 10).map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-b-0">
              <div className="text-sm text-slate-200">
                {activity.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} - {activity.work_id}
                {activity.verse_id && ` (${activity.verse_id})`}
              </div>
              <div className="text-xs text-slate-400">
                {new Date(activity.date).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PendingTab({ 
  items, 
  onItemAction, 
  selectedWork, 
  works, 
  onWorkChange 
}: { 
  items: PendingItem[];
  onItemAction: (item: PendingItem, action: string) => void;
  selectedWork: string;
  works: WorkSummary[];
  onWorkChange: (workId: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Work Filter */}
      <div className="flex gap-4 items-center">
        <label className="text-sm font-medium text-slate-200">Filter by Work:</label>
        <select
          value={selectedWork}
          onChange={(e) => onWorkChange(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
        >
          <option value="">All Works</option>
          {works.map(work => (
            <option key={work.work_id} value={work.work_id}>
              {work.title.en || work.title.bn || work.work_id}
            </option>
          ))}
        </select>
      </div>

      {/* Pending Items */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-800 bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Work</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Content</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">State</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((item) => (
                <tr key={`${item.type}-${item.item_id}`} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm text-slate-200">
                    <span className={`px-2 py-1 rounded text-xs ${
                      item.type === 'verse' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {item.work_title.en || item.work_title.bn || item.work_id}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {item.number_manual || item.item_id}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200 max-w-xs truncate">
                    {Object.values(item.texts).find(text => text) || 'No content'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${STATE_COLORS[item.state] || 'bg-slate-500/20 text-slate-300'}`}>
                      {item.state.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onItemAction(item, 'approve')}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => onItemAction(item, 'flag')}
                        className="text-xs text-orange-400 hover:text-orange-300"
                      >
                        Flag
                      </button>
                      <button
                        onClick={() => onItemAction(item, 'reject')}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}



function BulkActionsTab({
  items,
  selectedItems,
  onToggleItem,
  bulkAction,
  onBulkActionChange,
  bulkIssues,
  onBulkIssuesChange,
  onExecute,
  selectedWork,
  works,
  onWorkChange
}: {
  items: PendingItem[];
  selectedItems: Set<string>;
  onToggleItem: (itemId: string) => void;
  bulkAction: string;
  onBulkActionChange: (action: string) => void;
  bulkIssues: string;
  onBulkIssuesChange: (issues: string) => void;
  onExecute: () => void;
  selectedWork: string;
  works: WorkSummary[];
  onWorkChange: (workId: string) => void;
}) {
  const selectAll = () => {
    items.forEach(item => onToggleItem(item.item_id));
  };

  const clearSelection = () => {
    selectedItems.forEach(id => onToggleItem(id));
  };

  return (
    <div className="space-y-6">
      {/* Work Filter */}
      <div className="flex gap-4 items-center">
        <label className="text-sm font-medium text-slate-200">Select Work:</label>
        <select
          value={selectedWork}
          onChange={(e) => onWorkChange(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
        >
          <option value="">Choose a work...</option>
          {works.map(work => (
            <option key={work.work_id} value={work.work_id}>
              {work.title.en || work.title.bn || work.work_id}
            </option>
          ))}
        </select>
      </div>

      {selectedWork && (
        <>
          {/* Bulk Action Controls */}
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Bulk Actions</h3>
            <div className="space-y-4">
              <div className="flex gap-4 items-center">
                <button
                  onClick={selectAll}
                  className="text-sm text-brand hover:text-brand-light"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="text-sm text-slate-400 hover:text-slate-200"
                >
                  Clear Selection
                </button>
                <span className="text-sm text-slate-400">
                  {selectedItems.size} items selected
                </span>
              </div>

              <div className="flex gap-4 items-center">
                <select
                  value={bulkAction}
                  onChange={(e) => onBulkActionChange(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
                >
                  <option value="">Choose action...</option>
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                  <option value="flag">Flag</option>
                  <option value="rollback">Rollback</option>
                </select>

                {(bulkAction === 'reject' || bulkAction === 'flag') && (
                  <input
                    type="text"
                    placeholder="Issues/Comments (optional)"
                    value={bulkIssues}
                    onChange={(e) => onBulkIssuesChange(e.target.value)}
                    className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
                  />
                )}

                <button
                  onClick={onExecute}
                  disabled={!selectedItems.size || !bulkAction}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Execute
                </button>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-800 bg-slate-950">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === items.length && items.length > 0}
                        onChange={selectAll}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand focus:ring-brand"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">ID</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Content</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">State</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {items.map((item) => (
                    <tr key={item.item_id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.item_id)}
                          onChange={() => onToggleItem(item.item_id)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand focus:ring-brand"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">
                        {item.number_manual || item.item_id}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200 max-w-xs truncate">
                        {Object.values(item.texts).find(text => text) || 'No content'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${STATE_COLORS[item.state as keyof typeof STATE_COLORS] || 'bg-slate-500/20 text-slate-300'}`}>
                          {item.state.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">
                        {item.tags?.join(', ') || 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}