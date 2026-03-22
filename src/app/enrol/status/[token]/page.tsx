"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Mail,
  Phone,
  AlertCircle,
} from "lucide-react";

interface SubmissionStatus {
  status: string;
  childNames: string;
  parentName: string;
  createdAt: string;
  processedAt: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  submitted: { label: "Under Review", color: "text-blue-600 bg-blue-50" },
  reviewing: { label: "Being Reviewed", color: "text-amber-600 bg-amber-50" },
  processed: { label: "Confirmed", color: "text-green-600 bg-green-50" },
  needs_info: { label: "More Info Needed", color: "text-orange-600 bg-orange-50" },
  rejected: { label: "Not Proceeding", color: "text-red-600 bg-red-50" },
};

export default function EnrolmentStatusPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<SubmissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/enrol/status/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Enrolment not found. Please check your link."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-8 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Enrolment Not Found</h2>
        <p className="text-muted">{error}</p>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[data.status] || STATUS_MAP.submitted;
  const isConfirmed = data.status === "processed";
  const isSubmitted = data.status === "submitted" || data.status === "reviewing";

  const TIMELINE = [
    {
      icon: CheckCircle,
      title: "Form Submitted",
      description: `Received on ${new Date(data.createdAt).toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
      done: true,
    },
    {
      icon: Mail,
      title: "Confirmation Email Sent",
      description: "A confirmation was sent to your email address.",
      done: true,
    },
    {
      icon: FileText,
      title: "Review by Our Team",
      description: isConfirmed
        ? `Reviewed on ${new Date(data.processedAt!).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
          })}`
        : "Our team is reviewing your enrolment details.",
      done: isConfirmed,
      current: isSubmitted,
    },
    {
      icon: Phone,
      title: "Coordinator Contact",
      description: isConfirmed
        ? "Your coordinator has confirmed your booking."
        : "A coordinator will call to confirm booking details.",
      done: isConfirmed,
    },
    {
      icon: Clock,
      title: "Ready for First Session",
      description: "We'll send a 'What to Bring' guide before your child's first day.",
      done: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-8 text-center">
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4 ${statusInfo.color}`}
        >
          {isConfirmed ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
          {statusInfo.label}
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Enrolment for {data.childNames}
        </h2>
        <p className="text-muted text-sm">
          Submitted by {data.parentName}
        </p>
      </div>

      {/* Timeline */}
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 sm:p-8">
        <h3 className="text-lg font-bold text-foreground mb-6">Progress</h3>
        <div className="space-y-0">
          {TIMELINE.map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    item.done
                      ? "bg-green-100 text-green-600"
                      : item.current
                      ? "bg-brand/10 text-brand animate-pulse"
                      : "bg-surface text-muted"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                {i < TIMELINE.length - 1 && (
                  <div
                    className={`w-0.5 h-full min-h-[24px] ${
                      item.done ? "bg-green-200" : "bg-border"
                    }`}
                  />
                )}
              </div>
              <div className="pb-6">
                <p
                  className={`text-sm font-semibold ${
                    item.done
                      ? "text-green-700"
                      : item.current
                      ? "text-brand"
                      : "text-muted"
                  }`}
                >
                  {item.title}
                </p>
                <p className="text-sm text-muted mt-0.5">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 text-center">
        <p className="text-sm text-muted">
          Questions about your enrolment? Contact us at{" "}
          <a
            href="mailto:info@amanaoshc.com.au"
            className="text-brand font-medium hover:underline"
          >
            info@amanaoshc.com.au
          </a>
        </p>
      </div>
    </div>
  );
}
