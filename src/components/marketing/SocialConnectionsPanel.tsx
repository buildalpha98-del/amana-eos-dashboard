"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Unplug,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import {
  useSocialConnections,
  useConnectSocial,
  useDisconnectSocial,
} from "@/hooks/useMarketing";
import type { SocialConnectionData } from "@/hooks/useMarketing";

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "facebook") {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1877F2]">
        <svg
          viewBox="0 0 24 24"
          fill="white"
          className="h-5 w-5"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </div>
    );
  }
  if (platform === "instagram") {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]">
        <svg
          viewBox="0 0 24 24"
          fill="white"
          className="h-5 w-5"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-300">
      <span className="text-xs font-bold text-white">?</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          <CheckCircle2 className="h-3 w-3" /> Connected
        </span>
      );
    case "expired":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
          <Clock className="h-3 w-3" /> Expired
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          <XCircle className="h-3 w-3" /> Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          <Unplug className="h-3 w-3" /> Disconnected
        </span>
      );
  }
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export function SocialConnectionsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(
    null
  );

  const { data: connections, isLoading } = useSocialConnections();
  const connectSocial = useConnectSocial();
  const disconnectSocial = useDisconnectSocial();

  function handleConnect(platform: string) {
    connectSocial.mutate(
      { platform },
      {
        onSuccess: (data) => {
          // Redirect to Meta OAuth
          window.location.href = data.authUrl;
        },
      }
    );
  }

  function handleDisconnect(connectionId: string) {
    if (confirmDisconnect !== connectionId) {
      setConfirmDisconnect(connectionId);
      return;
    }
    disconnectSocial.mutate(
      { connectionId },
      {
        onSuccess: () => setConfirmDisconnect(null),
      }
    );
  }

  const hasConnections = connections && connections.length > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Header - clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <h3 className="text-sm font-semibold text-gray-900">
            Social Media Connections
          </h3>
          {hasConnections && (
            <span className="rounded-full bg-[#004E64] px-2 py-0.5 text-xs font-medium text-white">
              {connections.length}
            </span>
          )}
        </div>
        {!expanded && hasConnections && (
          <div className="flex items-center gap-2">
            {connections.slice(0, 3).map((conn: SocialConnectionData) => (
              <PlatformIcon key={conn.id} platform={conn.platform} />
            ))}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 px-5 py-4 space-y-4">
          {/* Connect buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleConnect("facebook")}
              disabled={connectSocial.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#1565C0] transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Connect Facebook
            </button>
            <button
              onClick={() => handleConnect("instagram")}
              disabled={connectSocial.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              Connect Instagram
            </button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <p className="text-sm text-gray-500">Loading connections...</p>
          )}

          {/* Connection cards */}
          {!isLoading && connections && connections.length === 0 && (
            <p className="text-sm text-gray-500">
              No social accounts connected yet. Click a button above to get
              started.
            </p>
          )}

          {connections?.map((conn: SocialConnectionData) => (
            <div
              key={conn.id}
              className="flex items-start gap-3 rounded-lg border border-gray-200 p-3"
            >
              <PlatformIcon platform={conn.platform} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {conn.accountName || conn.accountId || "Unknown Account"}
                  </p>
                  <StatusBadge status={conn.status} />
                </div>
                <p className="text-xs text-gray-500">
                  {conn.platform.charAt(0).toUpperCase() +
                    conn.platform.slice(1)}{" "}
                  {conn.service
                    ? `- ${conn.service.name}`
                    : ""}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Last synced: {formatTimeAgo(conn.lastSyncAt)}
                </p>

                {/* Error display */}
                {conn.lastSyncError && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-600 break-all">
                      {conn.lastSyncError}
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDisconnect(conn.id)}
                disabled={disconnectSocial.isPending}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  confirmDisconnect === conn.id
                    ? "bg-red-600 text-white"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {confirmDisconnect === conn.id ? "Confirm" : "Disconnect"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
