"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, Loader2, Mail, MailX, Bell } from "lucide-react";

interface PrefsData {
  firstName: string;
  email: string;
  subscribed: boolean;
  serviceName: string;
}

export default function NotificationPreferencesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const contactId = params.contactId as string;
  const autoUnsubscribe = searchParams.get("unsubscribe") === "true";

  const [data, setData] = useState<PrefsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/notifications/preferences/${contactId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setData(d);
        // Auto-unsubscribe if URL param is set
        if (autoUnsubscribe && d.subscribed) {
          handleToggle(false);
        }
      })
      .catch(() => setError("Preferences not found."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const handleToggle = async (newValue: boolean) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/notifications/preferences/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed: newValue }),
      });
      if (res.ok) {
        setData((prev) => (prev ? { ...prev, subscribed: newValue } : prev));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent fail
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] flex items-center justify-center p-4">
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <MailX className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Not Found</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        {/* Header */}
        <div className="text-center mb-2">
          <img src="/logo-full-white.svg" alt="Amana OSHC" className="h-8 mx-auto mb-4" />
        </div>

        {/* Main card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Email Preferences</h2>
              <p className="text-sm text-gray-500">{data.email}</p>
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-6">
            Hi {data.firstName || "there"}, manage your email notifications from{" "}
            <strong>{data.serviceName}</strong>.
          </p>

          {/* Toggle */}
          <div
            className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
              data.subscribed
                ? "bg-green-50 border-green-200"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center gap-3">
              {data.subscribed ? (
                <Mail className="h-5 w-5 text-green-600" />
              ) : (
                <MailX className="h-5 w-5 text-gray-400" />
              )}
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {data.subscribed ? "Subscribed" : "Unsubscribed"}
                </p>
                <p className="text-xs text-gray-500">
                  {data.subscribed
                    ? "You'll receive updates, check-ins, and helpful tips."
                    : "You won't receive any nurture or follow-up emails."}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(!data.subscribed)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                data.subscribed ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  data.subscribed ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Saved toast */}
          {saved && (
            <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-lg">
              <Check className="h-4 w-4" />
              Preferences saved
            </div>
          )}

          <p className="text-xs text-gray-400 mt-6">
            This only affects nurture and follow-up emails. Important service
            notifications (safety alerts, booking confirmations) will always be sent.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-white/40 text-xs">
          Amana OSHC &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
