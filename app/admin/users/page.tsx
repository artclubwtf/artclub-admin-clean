"use client";

import { useEffect, useMemo, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  role: string;
  artistId?: string;
  isActive: boolean;
  createdAt?: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = search.trim();
        const qs = query ? `?email=${encodeURIComponent(query)}` : "";
        const res = await fetch(`/api/users${qs}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { users?: UserRow[]; error?: string } | null;
        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load users");
        }
        if (!active) return;
        setUsers(Array.isArray(payload?.users) ? payload?.users : []);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load users");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [search]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.trim().toLowerCase();
    return users.filter((u) => u.email.toLowerCase().includes(term));
  }, [users, search]);

  return (
    <div className="page space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-600">Team-created accounts for artists and staff.</p>
        </div>
        <div className="text-sm text-slate-500">{loading ? "Loading..." : `${filteredUsers.length} users`}</div>
      </header>

      <div className="ac-card space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="w-full text-sm text-slate-700 sm:w-80">
            <span className="sr-only">Search by email</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email..."
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>
          <span className="text-xs text-slate-500">API: /api/users (team-only)</span>
        </div>

        {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-auto">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>ArtistId</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-sm text-slate-600">
                    {loading ? "Loading..." : "No users found"}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium text-slate-900">{user.email}</td>
                    <td className="text-sm uppercase text-slate-600">{user.role}</td>
                    <td className="text-sm text-slate-700">{user.artistId ?? "—"}</td>
                    <td className="text-sm text-slate-700">{user.isActive ? "Active" : "Inactive"}</td>
                    <td className="text-sm text-slate-500">
                      {user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
