"use client";

/**
 * Per-service editable content tab. Lives under Overview → Content.
 *
 * Editable by: org admin (owner / head_office / admin) and the Director
 * of Service whose User.serviceId matches this service. Everyone else
 * sees the same UI in read-only mode (Save button hidden, fields
 * disabled) — useful for staff browsing their own centre's About page.
 *
 * 2026-05-16: introduced as part of the per-service-content rollout.
 */

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Plus, Trash2, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import type { Role } from "@prisma/client";
import {
  SERVICE_CONTENT_DEFAULTS,
  type ServiceContent,
} from "@/lib/service-content-shared";

const ORG_WIDE_EDIT_ROLES = new Set<Role>(["owner", "head_office", "admin"]);

interface Props {
  serviceId: string;
}

/** A policy from the document library, offered for selection. */
interface PolicyDoc {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
}

export function ServiceContentTab({ serviceId }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const userServiceId = (session?.user as { serviceId?: string | null })
    ?.serviceId;

  const canEdit = !!role && (
    ORG_WIDE_EDIT_ROLES.has(role) ||
    (role === "member" && userServiceId === serviceId)
  );

  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState<ServiceContent>(
    SERVICE_CONTENT_DEFAULTS,
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingMap, setUploadingMap] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLInputElement>(null);
  const [policyDocs, setPolicyDocs] = useState<PolicyDoc[]>([]);

  // The policy library is org-wide and jurisdiction-mixed — a Victorian
  // regulation and a NSW one sit side by side — so this offers ALL of
  // them and the admin picks which apply here.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents?category=policy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        const list = Array.isArray(body) ? body : (body.documents ?? []);
        setPolicyDocs(
          list.map((d: Record<string, unknown>) => ({
            id: String(d.id),
            title: String(d.title ?? d.fileName ?? "Untitled"),
            fileName: String(d.fileName ?? ""),
            fileUrl: String(d.fileUrl ?? ""),
          })),
        );
      })
      .catch(() => {
        /* the picker just shows empty; the rest of the tab still works */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/services/${serviceId}/content`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { content?: ServiceContent } | null) => {
        if (cancelled) return;
        if (body?.content) setContent(body.content);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/content`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${res.status})`);
      }
      toast({ description: "Service content saved." });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Could not save",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/content-uploads", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string };
      setContent((c) => ({ ...c, heroImage: body.url }));
      toast({ description: "Image uploaded. Save to apply." });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  }

  /**
   * The service map. Same uploader as the hero, but the FILE NAME is kept
   * too: a PDF has no preview, so the name is the only thing telling an
   * admin which map is currently attached.
   */
  async function handleMapUpload(file: File) {
    setUploadingMap(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/content-uploads", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string };
      setContent((c) => ({
        ...c,
        serviceMapUrl: body.url,
        serviceMapName: file.name,
      }));
      toast({ description: "Map uploaded. Save to apply." });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploadingMap(false);
    }
  }

  function addContact() {
    setContent((c) => ({
      ...c,
      contacts: [
        ...c.contacts,
        { role: "Director of Service", name: "", phone: "", email: "" },
      ],
    }));
  }
  function removeContact(idx: number) {
    setContent((c) => ({
      ...c,
      contacts: c.contacts.filter((_, i) => i !== idx),
    }));
  }
  function updateContact(
    idx: number,
    key: "role" | "name" | "phone" | "email",
    value: string,
  ) {
    setContent((c) => ({
      ...c,
      contacts: c.contacts.map((ct, i) =>
        i === idx ? { ...ct, [key]: value } : ct,
      ),
    }));
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12 text-muted text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading content…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            What families see
          </h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Everything below appears on the family&apos;s My Centre tab.
            Anything left blank is hidden there rather than shown empty.
            Owner / admin / State Manager can edit any centre; Directors of
            Service edit their own.
            {!canEdit && (
              <span className="block mt-1 text-amber-700">
                You&apos;re viewing this centre in read-only mode.
              </span>
            )}
          </p>
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={saving} variant="primary">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save changes
          </Button>
        )}
      </div>

      {/* Hero */}
      <Section title="Hero image + tagline">
        <div className="flex gap-4 items-start">
          <div className="flex-shrink-0">
            <div
              className="w-32 h-20 rounded-lg bg-surface border border-border overflow-hidden flex items-center justify-center"
              style={
                content.heroImage
                  ? {
                      backgroundImage: `url(${content.heroImage})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            >
              {!content.heroImage && (
                <span className="text-xs text-muted">No image</span>
              )}
            </div>
            {canEdit && (
              <div className="mt-2 flex flex-col gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Upload
                </Button>
                {content.heroImage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setContent((c) => ({ ...c, heroImage: "" }))
                    }
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex-1">
            <Field label="Tagline">
              <input
                type="text"
                value={content.tagline}
                onChange={(e) =>
                  setContent((c) => ({ ...c, tagline: e.target.value }))
                }
                disabled={!canEdit}
                placeholder="e.g. Inspiring afternoons, every day"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Where to find us">
        <Field label="Location within the school">
          <Textarea
            value={content.locationWithinSchool}
            onChange={(v) =>
              setContent((c) => ({ ...c, locationWithinSchool: v }))
            }
            disabled={!canEdit}
            rows={2}
            placeholder="e.g. Hall, next to the canteen. Enter via Gate 3."
          />
        </Field>
        <p className="text-xs text-muted -mt-1">
          A street address gets a family to the school. This gets them to us.
        </p>

        <Field label="Meeting / pick-up points">
          <Textarea
            value={content.meetingPoints}
            onChange={(v) => setContent((c) => ({ ...c, meetingPoints: v }))}
            disabled={!canEdit}
            rows={3}
            placeholder="Where families meet us at drop-off and pick-up."
          />
        </Field>

        <div className="pt-2">
          <span className="text-xs font-medium text-muted block mb-2">
            Service map
          </span>
          {content.serviceMapUrl ? (
            <div className="flex items-start gap-3 flex-wrap">
              {/* A PDF has no thumbnail without a renderer, so it gets a
                  labelled card instead of a broken image box. */}
              {content.serviceMapUrl.toLowerCase().endsWith(".pdf") ? (
                <a
                  href={content.serviceMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-sm text-foreground"
                >
                  <FileText className="h-4 w-4 text-muted" />
                  {content.serviceMapName || "Service map (PDF)"}
                </a>
              ) : (
                <a
                  href={content.serviceMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-40 h-28 rounded-lg border border-border overflow-hidden bg-surface"
                  style={{
                    backgroundImage: `url(${content.serviceMapUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                  aria-label="Open the service map"
                />
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => mapRef.current?.click()}
                    disabled={uploadingMap}
                  >
                    {uploadingMap ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setContent((c) => ({
                        ...c,
                        serviceMapUrl: "",
                        serviceMapName: "",
                      }))
                    }
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>
              )}
            </div>
          ) : canEdit ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => mapRef.current?.click()}
              disabled={uploadingMap}
            >
              {uploadingMap ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Upload map
            </Button>
          ) : (
            <p className="text-xs text-muted">No map uploaded.</p>
          )}
          <input
            ref={mapRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleMapUpload(f);
            }}
          />
          <p className="mt-2 text-xs text-muted">
            An image works best — a parent at the gate can pinch to zoom it.
            PDFs open in a new tab.
          </p>
        </div>
      </Section>

      <Section title="About / Welcome message">
        <Textarea
          value={content.about}
          onChange={(v) => setContent((c) => ({ ...c, about: v }))}
          disabled={!canEdit}
          rows={6}
          placeholder="What makes this centre special. Shared with families and shown at the top of their My Centre tab."
        />
        <Field label="Vision statement">
          <Textarea
            value={content.vision}
            onChange={(v) => setContent((c) => ({ ...c, vision: v }))}
            disabled={!canEdit}
            rows={2}
            placeholder="The one or two lines you'd want a family to remember."
          />
        </Field>
      </Section>

      <Section
        title="Key contacts"
        actions={
          canEdit && (
            <Button size="sm" variant="outline" onClick={addContact}>
              <Plus className="h-3 w-3" /> Add contact
            </Button>
          )
        }
      >
        {content.contacts.length === 0 && (
          <p className="text-sm text-muted italic">
            No contacts added yet. Parents only see this section if at least
            one contact is set.
          </p>
        )}
        {content.contacts.map((contact, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end p-3 rounded-md border border-border bg-surface/50"
          >
            <Field label="Role / title">
              <input
                type="text"
                value={contact.role}
                onChange={(e) => updateContact(i, "role", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
            <Field label="Name">
              <input
                type="text"
                value={contact.name}
                onChange={(e) => updateContact(i, "name", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={contact.phone}
                onChange={(e) => updateContact(i, "phone", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Email">
                <input
                  type="email"
                  value={contact.email}
                  onChange={(e) => updateContact(i, "email", e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </Field>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeContact(i)}
                  className="p-2 text-muted hover:text-red-600"
                  aria-label="Remove contact"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Daily routine">
        <Textarea
          value={content.dailyRoutine}
          onChange={(v) => setContent((c) => ({ ...c, dailyRoutine: v }))}
          disabled={!canEdit}
          rows={6}
          placeholder="Describe the daily rhythm at THIS centre. Falls back to the org-wide Amana Way default routine when blank."
        />
      </Section>

      <Section title="Food provider + dietary policies">
        <Textarea
          value={content.foodProvider}
          onChange={(v) => setContent((c) => ({ ...c, foodProvider: v }))}
          disabled={!canEdit}
          rows={3}
          placeholder="e.g. Woolworths at Work — halal-certified, peanut-free kitchen, allergen flagging via OWNA."
        />
      </Section>

      <Section title="Parent onboarding walkthrough">
        <Textarea
          value={content.parentOnboarding}
          onChange={(v) => setContent((c) => ({ ...c, parentOnboarding: v }))}
          disabled={!canEdit}
          rows={5}
          placeholder="What new families can expect when they enrol — orientation steps, first-day routine, who to call."
        />
      </Section>

      {/* Selected, not "everything for this centre": the library is
          jurisdiction-mixed, and showing a Sydney family a Victorian
          regulation is worse than showing them nothing. The document
          stays in the library, so updating it there updates it here. */}
      <Section title="Policies shown to families">
        {policyDocs.length === 0 ? (
          <p className="text-sm text-muted">
            No policy documents in the library yet. Upload them under
            Documents with the category &ldquo;policy&rdquo; and they&apos;ll
            appear here to select.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Tick the ones that apply at this centre. Families see only
              these, on their My Centre tab.
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {policyDocs.map((d) => {
                const checked = content.policyDocumentIds.includes(d.id);
                return (
                  <label
                    key={d.id}
                    className="flex items-start gap-3 py-1.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canEdit}
                      onChange={() =>
                        setContent((c) => ({
                          ...c,
                          policyDocumentIds: checked
                            ? c.policyDocumentIds.filter((x) => x !== d.id)
                            : [...c.policyDocumentIds, d.id],
                        }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <span className="text-sm text-foreground">
                      {d.title}
                      {d.fileName && (
                        <span className="block text-xs text-muted">
                          {d.fileName}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              {content.policyDocumentIds.length} selected.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {actions}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function Textarea({
  value,
  onChange,
  disabled,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
    />
  );
}
