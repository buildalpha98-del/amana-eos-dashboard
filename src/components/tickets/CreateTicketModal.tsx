"use client";

import { useState } from "react";
import { useCreateTicket } from "@/hooks/useTickets";
import { useContacts, useCreateContact } from "@/hooks/useContacts";
import { useQuery } from "@tanstack/react-query";
import { X, Plus, UserPlus } from "lucide-react";
import type { TicketPriority } from "@prisma/client";

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface UserOption {
  id: string;
  name: string;
}

export function CreateTicketModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createTicket = useCreateTicket();
  const { data: contacts = [] } = useContacts();
  const createContact = useCreateContact();

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [contactId, setContactId] = useState("");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [serviceId, setServiceId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState("");

  // New contact form
  const [showNewContact, setShowNewContact] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newParentName, setNewParentName] = useState("");
  const [newChildName, setNewChildName] = useState("");

  if (!open) return null;

  const handleCreateContact = async () => {
    if (!newPhone || !newParentName) return;
    const waId = newPhone.replace(/[^0-9]/g, "");
    createContact.mutate(
      {
        waId,
        phoneNumber: newPhone,
        parentName: newParentName,
        childName: newChildName || undefined,
        serviceId: serviceId || undefined,
      },
      {
        onSuccess: (data: { id: string }) => {
          setContactId(data.id);
          setShowNewContact(false);
          setNewPhone("");
          setNewParentName("");
          setNewChildName("");
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!contactId) {
      setError("Please select or create a contact");
      return;
    }

    createTicket.mutate(
      {
        contactId,
        subject: subject || undefined,
        priority,
        serviceId: serviceId || undefined,
        assignedToId: assignedToId || undefined,
      },
      {
        onSuccess: () => {
          setContactId("");
          setSubject("");
          setPriority("normal");
          setServiceId("");
          setAssignedToId("");
          onClose();
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Create Ticket</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Create a manual support ticket for a phone or walk-in query
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
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
          {/* Contact Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Parent Contact *
            </label>
            {!showNewContact ? (
              <div className="flex gap-2">
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                >
                  <option value="">Select a contact...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentName || c.name || c.phoneNumber}
                      {c.childName ? ` (${c.childName})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewContact(true)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                  title="Create new contact"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  New Contact
                </p>
                <input
                  type="text"
                  placeholder="Parent name *"
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Phone number *"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Child name (optional)"
                  value={newChildName}
                  onChange={(e) => setNewChildName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewContact(false)}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-white text-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateContact}
                    disabled={!newPhone || !newParentName || createContact.isPending}
                    className="px-3 py-1.5 text-xs bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] disabled:opacity-50"
                  >
                    {createContact.isPending ? "Creating..." : "Add Contact"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="Brief description of the enquiry..."
            />
          </div>

          {/* Priority & Service */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Centre
              </label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="">Not specified</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assign To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Assign To
            </label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2 border-t border-gray-200 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTicket.isPending}
              className="flex-1 px-4 py-2.5 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {createTicket.isPending ? "Creating..." : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
