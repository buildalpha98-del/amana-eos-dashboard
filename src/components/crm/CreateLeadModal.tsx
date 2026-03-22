"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateLead } from "@/hooks/useCRM";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export function CreateLeadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createLead = useCreateLead();
  const [schoolName, setSchoolName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [source, setSource] = useState<"direct" | "tender">("direct");
  const [tenderRef, setTenderRef] = useState("");
  const [tenderUrl, setTenderUrl] = useState("");
  const [estimatedCapacity, setEstimatedCapacity] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;

    await createLead.mutateAsync({
      schoolName: schoolName.trim(),
      contactName: contactName || undefined,
      contactEmail: contactEmail || undefined,
      contactPhone: contactPhone || undefined,
      address: address || undefined,
      suburb: suburb || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      source,
      tenderRef: tenderRef || undefined,
      tenderUrl: tenderUrl || undefined,
      estimatedCapacity: estimatedCapacity ? Number(estimatedCapacity) : undefined,
      notes: notes || undefined,
    });

    // Reset form
    setSchoolName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setAddress("");
    setSuburb("");
    setState("");
    setPostcode("");
    setSource("direct");
    setTenderRef("");
    setTenderUrl("");
    setEstimatedCapacity("");
    setNotes("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Create Lead</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface rounded">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              School Name *
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent"
              placeholder="e.g. Sunshine Primary School"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as "direct" | "tender")}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
              >
                <option value="direct">Direct</option>
                <option value="tender">Tender</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Est. Capacity
              </label>
              <input
                type="number"
                value={estimatedCapacity}
                onChange={(e) => setEstimatedCapacity(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                placeholder="e.g. 60"
              />
            </div>
          </div>

          {source === "tender" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Tender Ref
                </label>
                <input
                  type="text"
                  value={tenderRef}
                  onChange={(e) => setTenderRef(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Tender URL
                </label>
                <input
                  type="url"
                  value={tenderUrl}
                  onChange={(e) => setTenderUrl(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                />
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-foreground/80 mb-3">Contact</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-muted mb-1">Phone</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-foreground/80 mb-3">Location</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  placeholder="Suburb"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                />
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                >
                  <option value="">State</option>
                  {AU_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="Postcode"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:bg-surface rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createLead.isPending || !schoolName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-dark hover:bg-brand rounded-lg disabled:opacity-50"
            >
              {createLead.isPending ? "Creating..." : "Create Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
