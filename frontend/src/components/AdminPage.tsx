import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient, formatError } from "../lib/apiClient";

interface User {
  id: string;
  email: string;
  roles: string[];
  enabled?: boolean;
  created_at?: string;
}

interface Analytics {
  total_works: number;
  total_verses: number;
  total_commentary: number;
  works_by_status: Record<string, number>;
  recent_activity: Array<{ type: string; count: number; date: string }>;
}

const ROLE_OPTIONS = [
  { label: "Platform Admin", value: "platform_admin" },
  { label: "Submitter/Requester", value: "submitter" },
  { label: "Reviewer", value: "reviewer" },
  { label: "SME (Subject-Matter Expert)", value: "sme" },
];

interface AdminPageProps {
  adminUser?: { id: string; email: string; roles: string[] };
  onLogout?: () => void;
}

export function AdminPage({ adminUser, onLogout }: AdminPageProps = {}) {
  const { user } = useAuth();
  const effectiveUser = adminUser || user;
  const [users, setUsers] = useState<User[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'analytics'>('users');
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);

  // Check if effective user is platform admin
  const isAdmin = effectiveUser?.roles?.includes("platform_admin") || effectiveUser?.roles?.includes("admin");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<User[]>("/admin/users");
      setUsers(response.data);
    } catch (error) {
      setError(formatError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    try {
      const response = await apiClient.get<Analytics>("/admin/analytics");
      setAnalytics(response.data);
    } catch (error) {
      setError(formatError(error));
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
      void loadAnalytics();
    }
  }, [isAdmin, loadUsers, loadAnalytics]);

  const handleCreateUser = async (userData: Omit<User, "id">) => {
    try {
      await apiClient.post("/admin/users", userData);
      await loadUsers();
      setShowCreateForm(false);
      setError(null);
    } catch (error) {
      setError(formatError(error));
    }
  };

  const handleUpdateUser = async (userId: string, userData: Partial<User>) => {
    try {
      await apiClient.put(`/admin/users/${userId}`, userData);
      await loadUsers();
      setEditingUser(null);
      setError(null);
    } catch (error) {
      setError(formatError(error));
    }
  };

  const handleApproveUser = async (pendingUser: User) => {
    setError(null);
    setApprovingUserId(pendingUser.id);
    try {
      const existingRoles = pendingUser.roles ?? [];
      const retainedRoles = existingRoles.filter((role) => role !== "submitter");
      const nextRoleSet = new Set<string>(retainedRoles);
      nextRoleSet.add("reviewer");
      const nextRoles = Array.from(nextRoleSet);
      await apiClient.put(`/admin/users/${pendingUser.id}`, {
        roles: nextRoles,
        enabled: true,
      });
      await loadUsers();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setApprovingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      await loadUsers();
      setError(null);
    } catch (error) {
      setError(formatError(error));
    }
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await apiClient.post("/admin/change-password", {
        current_password: currentPassword,
        new_password: newPassword
      });
      setShowPasswordForm(false);
      setError(null);
    } catch (error) {
      setError(formatError(error));
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400">You don't have permission to access the admin panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Platform Administration</h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowPasswordForm(true)}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-brand hover:text-white sm:px-4"
            >
              Change Password
            </button>
            {activeTab === 'users' && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-light sm:px-4"
              >
                Create User
              </button>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                className="rounded-md border border-rose-700 px-3 py-2 text-sm font-semibold text-rose-300 transition hover:border-rose-600 hover:text-rose-200 sm:px-4"
              >
                Logout
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-800">
          <nav className="flex space-x-4 sm:space-x-8">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              User Management
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Analytics
            </button>
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
        ) : activeTab === 'users' ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-800 bg-slate-950">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200 sm:px-6">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200 sm:px-6">Roles</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200 sm:px-6">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-200 sm:px-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((user) => {
                    const isPendingApproval =
                      Array.isArray(user.roles) &&
                      user.roles.length === 1 &&
                      user.roles[0] === "submitter";
                    const statusLabel = isPendingApproval
                      ? "Pending Approval"
                      : user.enabled !== false
                      ? "Active"
                      : "Disabled";
                    const statusClasses = isPendingApproval
                      ? "bg-yellow-500/20 text-yellow-300"
                      : user.enabled !== false
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/20 text-rose-300";
                    return (
                      <tr key={user.id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm text-slate-200 sm:px-6">{user.email}</td>
                        <td className="px-4 py-3 sm:px-6">
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role) => (
                              <span
                                key={role}
                                className={`rounded-full px-2 py-1 text-xs ${
                                  role === "submitter"
                                    ? "bg-slate-700/60 text-slate-200"
                                    : "bg-brand/20 text-brand-light"
                                }`}
                              >
                                {ROLE_OPTIONS.find((r) => r.value === role)?.label || role}
                              </span>
                            ))}
                            {user.roles.length === 0 && (
                              <span className="rounded-full bg-slate-700/60 px-2 py-1 text-xs text-slate-200">
                                No roles
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm sm:px-6">
                          <span className={`rounded-full px-2 py-1 text-xs ${statusClasses}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right sm:px-6">
                          <div className="flex flex-wrap justify-end gap-2">
                            {isPendingApproval && (
                              <button
                                onClick={() => handleApproveUser(user)}
                                disabled={approvingUserId === user.id}
                                className="rounded-full border border-emerald-500/60 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {approvingUserId === user.id ? "Approving…" : "Approve"}
                              </button>
                            )}
                            <button
                              onClick={() => setEditingUser(user)}
                              className="text-xs text-slate-400 hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-xs text-rose-400 hover:text-rose-300"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <AnalyticsView analytics={analytics} />
        )}

        {showCreateForm && (
          <UserForm
            onSubmit={handleCreateUser}
            onCancel={() => setShowCreateForm(false)}
            title="Create New User"
          />
        )}

        {editingUser && (
          <UserForm
            user={editingUser}
            onSubmit={(data) => handleUpdateUser(editingUser.id, data)}
            onCancel={() => setEditingUser(null)}
            title="Edit User"
          />
        )}

        {showPasswordForm && (
          <PasswordChangeForm
            onSubmit={handleChangePassword}
            onCancel={() => setShowPasswordForm(false)}
          />
        )}
      </div>
    </div>
  );
}

function AnalyticsView({ analytics }: { analytics: Analytics | null }) {
  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-white">{analytics.total_works}</div>
          <div className="text-sm text-slate-400">Total Works</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-white">{analytics.total_verses}</div>
          <div className="text-sm text-slate-400">Total Verses</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-white">{analytics.total_commentary}</div>
          <div className="text-sm text-slate-400">Total Commentary</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-2xl font-bold text-white">
            {Object.values(analytics.works_by_status).reduce((a, b) => a + b, 0)}
          </div>
          <div className="text-sm text-slate-400">Total Items</div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Content by Status</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(analytics.works_by_status).map(([status, count]) => (
            <div key={status} className="text-center">
              <div className="text-xl font-bold text-white">{count}</div>
              <div className="text-sm text-slate-400 capitalize">{status.replace('_', ' ')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {analytics.recent_activity.map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-2">
              <div className="text-sm text-slate-200">
                {activity.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
              <div className="text-sm text-slate-400">
                {activity.count} items
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PasswordChangeForm({ 
  onSubmit, 
  onCancel 
}: { 
  onSubmit: (currentPassword: string, newPassword: string) => void;
  onCancel: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    onSubmit(currentPassword, newPassword);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="border-b border-slate-800 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-100">Change Password</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-md border border-rose-700 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light"
            >
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface UserFormProps {
  user?: User;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  title: string;
}

function UserForm({ user, onSubmit, onCancel, title }: UserFormProps) {
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(user?.roles || ["submitter"]);
  const [enabled, setEnabled] = useState(user?.enabled !== false);

  const toggleRole = (role: string) => {
    setRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { email, roles, enabled };
    if (!user || password) {
      data.password = password;
    }
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="border-b border-slate-800 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">
                Password {user && "(leave blank to keep current)"}
              </label>
              <input
                type="password"
                required={!user}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">Roles</label>
              <div className="mt-2 space-y-2">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role.value} className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={roles.includes(role.value)}
                      onChange={() => toggleRole(role.value)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand focus:ring-brand"
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand focus:ring-brand"
                />
                User Enabled
              </label>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-light"
            >
              {user ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}