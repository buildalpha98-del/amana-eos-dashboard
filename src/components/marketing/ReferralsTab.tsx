"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Gift,
  Users,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Plus,
} from "lucide-react";

interface Referral {
  id: string;
  serviceId: string;
  referrerName: string;
  referredName: string;
  referredEmail: string | null;
  referredPhone: string | null;
  status: string;
  rewardAmount: number;
  rewardIssuedAt: string | null;
  createdAt: string;
  service: { id: string; name: string; code: string };
  referrerContact: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

interface ReferralStats {
  totalReferrals: number;
  conversionRate: number;
  totalRewardsIssued: number;
  rewardsPending: number;
  rewardsThisMonth: { amount: number; count: number };
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  pending: { bg: "bg-surface", text: "text-foreground/80", icon: Clock },
  enquired: { bg: "bg-blue-100", text: "text-blue-700", icon: Users },
  enrolled: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle },
  rewarded: { bg: "bg-emerald-100", text: "text-emerald-700", icon: Gift },
  expired: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
};

export function ReferralsTab({ serviceId }: { serviceId?: string }) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(() => {
    const params = new URLSearchParams();
    if (serviceId) params.set("serviceId", serviceId);
    if (filterStatus) params.set("status", filterStatus);

    const statsParams = new URLSearchParams();
    if (serviceId) statsParams.set("serviceId", serviceId);

    Promise.all([
      fetch(`/api/referrals?${params}`).then((r) => r.json()),
      fetch(`/api/referrals/stats?${statsParams}`).then((r) => r.json()),
    ])
      .then(([refData, statsData]) => {
        setReferrals(refData.referrals);
        setStatusCounts(refData.statusCounts);
        setStats(statsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [serviceId, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (id: string, newStatus: string) => {
    const body: Record<string, unknown> = { status: newStatus };
    if (newStatus === "rewarded") {
      body.rewardIssuedAt = new Date().toISOString();
    }
    await fetch(`/api/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  const statuses = ["", "pending", "enquired", "enrolled", "rewarded", "expired"];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Referrals"
            value={stats.totalReferrals}
            icon={Users}
            colour="blue"
          />
          <StatCard
            label="Conversion Rate"
            value={`${stats.conversionRate}%`}
            icon={TrendingUp}
            colour="green"
          />
          <StatCard
            label="Rewards This Month"
            value={`$${stats.rewardsThisMonth.amount.toLocaleString()}`}
            icon={DollarSign}
            colour="emerald"
            sub={`${stats.rewardsThisMonth.count} issued`}
          />
          <StatCard
            label="Rewards Pending"
            value={stats.rewardsPending}
            icon={AlertCircle}
            colour="amber"
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                filterStatus === s
                  ? "bg-brand/5 border-brand text-brand"
                  : "bg-card border-border text-muted hover:bg-surface"
              }`}
            >
              {s || "All"}
              {s && statusCounts[s] ? ` (${statusCounts[s]})` : ""}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand text-white rounded-lg hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" />
          Add Referral
        </button>
      </div>

      {/* Referrals Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface/50 text-left text-xs text-muted uppercase">
                <th className="px-4 py-3">Referrer</th>
                <th className="px-4 py-3">Referred</th>
                <th className="px-4 py-3">Centre</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reward</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No referrals found
                  </td>
                </tr>
              ) : (
                referrals.map((ref) => {
                  const style = STATUS_STYLES[ref.status] || STATUS_STYLES.pending;
                  const StatusIcon = style.icon;
                  return (
                    <tr key={ref.id} className="hover:bg-surface">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {ref.referrerName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{ref.referredName}</div>
                        {ref.referredEmail && (
                          <div className="text-xs text-muted">{ref.referredEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{ref.service.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          <StatusIcon className="h-3 w-3" />
                          {ref.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        ${ref.rewardAmount}
                        {ref.rewardIssuedAt && (
                          <span className="text-xs text-green-600 ml-1">Issued</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {new Date(ref.createdAt).toLocaleDateString("en-AU")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {ref.status === "pending" && (
                            <button
                              onClick={() => updateStatus(ref.id, "enquired")}
                              className="text-xs px-2 py-1 rounded bg-brand/5 text-brand hover:bg-brand/10"
                            >
                              Mark Enquired
                            </button>
                          )}
                          {ref.status === "enquired" && (
                            <button
                              onClick={() => updateStatus(ref.id, "enrolled")}
                              className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100"
                            >
                              Mark Enrolled
                            </button>
                          )}
                          {ref.status === "enrolled" && (
                            <button
                              onClick={() => updateStatus(ref.id, "rewarded")}
                              className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            >
                              Issue Reward
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Referral Modal */}
      {showCreate && (
        <CreateReferralModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  colour,
  sub,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  colour: string;
  sub?: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg bg-${colour}-50`}>
          <Icon className={`h-4 w-4 text-${colour}-600`} />
        </div>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function CreateReferralModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    serviceId: "",
    referrerName: "",
    referredName: "",
    referredEmail: "",
    referredPhone: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.services ?? [];
        setServices(list);
      })
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceId || !form.referrerName || !form.referredName) return;

    setSaving(true);
    try {
      await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      onCreated();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Add Referral</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Centre</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              required
            >
              <option value="">Select centre...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Referrer Name</label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.referrerName}
              onChange={(e) => setForm({ ...form, referrerName: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Referred Family Name</label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.referredName}
              onChange={(e) => setForm({ ...form, referredName: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Email</label>
              <input
                type="email"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.referredEmail}
                onChange={(e) => setForm({ ...form, referredEmail: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Phone</label>
              <input
                type="tel"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.referredPhone}
                onChange={(e) => setForm({ ...form, referredPhone: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create Referral"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
