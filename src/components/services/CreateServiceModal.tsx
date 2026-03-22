"use client";

import { useState } from "react";
import { useCreateService } from "@/hooks/useServices";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

export function CreateServiceModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createService = useCreateService();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("NSW");
  const [postcode, setPostcode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [managerId, setManagerId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [operatingDays, setOperatingDays] = useState("Mon-Fri");
  const [error, setError] = useState("");

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    createService.mutate(
      {
        name,
        code: code.toUpperCase(),
        address: address || undefined,
        suburb: suburb || undefined,
        state: state || undefined,
        postcode: postcode || undefined,
        phone: phone || undefined,
        email: email || undefined,
        managerId: managerId || null,
        capacity: capacity ? parseInt(capacity) : null,
        operatingDays: operatingDays || undefined,
      },
      {
        onSuccess: () => {
          setName("");
          setCode("");
          setAddress("");
          setSuburb("");
          setPostcode("");
          setPhone("");
          setEmail("");
          setManagerId("");
          setCapacity("");
          onClose();
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Add New Service Centre
            </h3>
            <p className="text-sm text-muted mt-0.5">
              Register a new OSHC centre
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Centre Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="e.g., Amana OSHC Lakemba"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Centre Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent uppercase"
                placeholder="e.g., LKB"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Suburb
              </label>
              <input
                type="text"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="NSW">NSW</option>
                <option value="VIC">VIC</option>
                <option value="QLD">QLD</option>
                <option value="SA">SA</option>
                <option value="WA">WA</option>
                <option value="TAS">TAS</option>
                <option value="NT">NT</option>
                <option value="ACT">ACT</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Postcode
              </label>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                maxLength={4}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Centre Manager
              </label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="">Select manager...</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Capacity
              </label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="Max children"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Operating Days
            </label>
            <input
              type="text"
              value={operatingDays}
              onChange={(e) => setOperatingDays(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="e.g., Mon-Fri"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createService.isPending}
              className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {createService.isPending ? "Adding..." : "Add Centre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
