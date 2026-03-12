"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";

interface NewEnquiryModalProps {
  onClose: () => void;
  onCreated: () => void;
}

interface ChildEntry {
  name: string;
  age: string;
}

const CHANNELS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "walkin", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
];

const DRIVERS = [
  { value: "homework", label: "Homework Help" },
  { value: "quran", label: "Quran / Iqra" },
  { value: "enrichment", label: "Enrichment" },
  { value: "working_parent", label: "Working Parent" },
  { value: "traffic", label: "Traffic / Convenience" },
  { value: "sports", label: "Sports" },
];

export function NewEnquiryModal({ onClose, onCreated }: NewEnquiryModalProps) {
  const [services, setServices] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [children, setChildren] = useState<ChildEntry[]>([{ name: "", age: "" }]);
  const [form, setForm] = useState({
    parentName: "",
    serviceId: "",
    channel: "phone",
    parentEmail: "",
    parentPhone: "",
    parentDriver: "",
    notes: "",
  });

  useEffect(() => {
    fetch("/api/services?status=active")
      .then((r) => r.json())
      .then((data) => setServices(data.services || data || []))
      .catch(console.error);
  }, []);

  const addChild = () => {
    setChildren([...children, { name: "", age: "" }]);
  };

  const removeChild = (index: number) => {
    if (children.length <= 1) return;
    setChildren(children.filter((_, i) => i !== index));
  };

  const updateChild = (index: number, field: keyof ChildEntry, value: string) => {
    const updated = [...children];
    updated[index] = { ...updated[index], [field]: value };
    setChildren(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const validChildren = children
        .filter((c) => c.name.trim())
        .map((c) => ({
          name: c.name.trim(),
          age: c.age ? parseInt(c.age) : null,
        }));

      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          parentEmail: form.parentEmail || null,
          parentPhone: form.parentPhone || null,
          parentDriver: form.parentDriver || null,
          notes: form.notes || null,
          childrenDetails: validChildren.length > 0 ? validChildren : null,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      }
    } catch (err) {
      console.error("Failed to create enquiry:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">New Enquiry</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Parent Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent Name *
            </label>
            <input
              required
              value={form.parentName}
              onChange={(e) => setForm({ ...form, parentName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="Full name"
            />
          </div>

          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Centre *
            </label>
            <select
              required
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select centre...</option>
              {services.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Channel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Channel *
            </label>
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Contact details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.parentEmail}
                onChange={(e) =>
                  setForm({ ...form, parentEmail: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                value={form.parentPhone}
                onChange={(e) =>
                  setForm({ ...form, parentPhone: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Children */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Children
              </label>
              <button
                type="button"
                onClick={addChild}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Child
              </button>
            </div>
            <div className="space-y-2">
              {children.map((child, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={child.name}
                    onChange={(e) => updateChild(i, "name", e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Child ${i + 1} name`}
                  />
                  <input
                    type="number"
                    min="3"
                    max="16"
                    value={child.age}
                    onChange={(e) => updateChild(i, "age", e.target.value)}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Age"
                  />
                  {children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChild(i)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Driver */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent Driver
            </label>
            <select
              value={form.parentDriver}
              onChange={(e) =>
                setForm({ ...form, parentDriver: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Not specified</option>
              {DRIVERS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="Any additional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Enquiry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
