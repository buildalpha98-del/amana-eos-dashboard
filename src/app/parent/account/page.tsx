"use client";

import { useEffect, useState } from "react";
import { Save, LogOut, Plus, Trash2 } from "lucide-react";
import {
  useParentProfile,
  useUpdateParentAccount,
  type UpdateAccountPayload,
} from "@/hooks/useParentPortal";
import { useParentAuth } from "@/components/parent/ParentAuthProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import { EnableNotificationsCard } from "@/components/parent/EnableNotificationsCard";

interface ContactForm {
  id?: string;
  name: string;
  phone: string;
  relationship: string;
}

export default function AccountPage() {
  const { data: profile, isLoading } = useParentProfile();
  const updateAccount = useUpdateParentAccount();
  const { logout } = useParentAuth();

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [crn, setCrn] = useState("");
  const [relationship, setRelationship] = useState("");
  const [occupation, setOccupation] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [street, setStreet] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [contacts, setContacts] = useState<ContactForm[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  // Hydrate form from profile
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setPhone(profile.phone ?? "");
    setDob(profile.dob ?? "");
    setCrn(profile.crn ?? "");
    setRelationship(profile.relationship ?? "");
    setOccupation(profile.occupation ?? "");
    setWorkplace(profile.workplace ?? "");
    setWorkPhone(profile.workPhone ?? "");
    setStreet(profile.address?.street ?? "");
    setSuburb(profile.address?.suburb ?? "");
    setState(profile.address?.state ?? "");
    setPostcode(profile.address?.postcode ?? "");
    setContacts(
      profile.emergencyContacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        relationship: c.relationship,
      }))
    );
  }, [profile]);

  const handleSave = () => {
    const payload: UpdateAccountPayload = {
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      phone,
      dob: dob || undefined,
      crn: crn.trim() || undefined,
      relationship: relationship.trim() || undefined,
      occupation: occupation.trim() || undefined,
      workplace: workplace.trim() || undefined,
      workPhone: workPhone.trim() || undefined,
      address: { street, suburb, state, postcode },
      emergencyContacts: contacts,
    };
    updateAccount.mutate(payload);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await mutateApi("/api/parent/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors — clear session anyway
    }
    logout();
  };

  const addContact = () => {
    setContacts((prev) => [
      ...prev,
      { name: "", phone: "", relationship: "" },
    ]);
  };

  const removeContact = (idx: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateContact = (
    idx: number,
    field: keyof ContactForm,
    value: string
  ) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  };

  if (isLoading) return <AccountSkeleton />;

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-[#7c7c8a] text-sm">
          Unable to load your account information.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Account
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          Update your contact details and emergency contacts.
        </p>
      </div>

      <EnableNotificationsCard />

      {/* Profile (editable) */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Your Details
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First Name" value={firstName} onChange={setFirstName} placeholder="First name" />
            <FormField label="Last Name" value={lastName} onChange={setLastName} placeholder="Last name" />
          </div>
          <ReadOnlyField
            label="Email"
            value={profile.email}
            note="To change your email, contact the centre — they can issue a new login link for the new address."
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date of Birth" type="date" value={dob} onChange={setDob} placeholder="" />
            <FormField label="CRN" value={crn} onChange={setCrn} placeholder="Centrelink CRN" />
          </div>
          <FormField label="Relationship to child" value={relationship} onChange={setRelationship} placeholder="Mother / Father / Guardian" />
        </div>
      </section>

      {/* Contact details (editable) */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Contact Details
        </h2>
        <div className="space-y-4">
          <FormField
            label="Mobile"
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="0400 000 000"
          />

          <div className="border-t border-[#e8e4df] pt-4">
            <p className="text-xs font-medium text-[#7c7c8a] mb-3">Address</p>
            <div className="space-y-3">
              <FormField
                label="Street"
                value={street}
                onChange={setStreet}
                placeholder="123 Example St"
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Suburb"
                  value={suburb}
                  onChange={setSuburb}
                  placeholder="Suburb"
                />
                <FormField
                  label="State"
                  value={state}
                  onChange={setState}
                  placeholder="NSW"
                />
              </div>
              <FormField
                label="Postcode"
                value={postcode}
                onChange={setPostcode}
                placeholder="2000"
                maxLength={4}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Work (editable) */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Work
        </h2>
        <div className="space-y-3">
          <FormField label="Occupation" value={occupation} onChange={setOccupation} placeholder="Your role" />
          <FormField label="Workplace" value={workplace} onChange={setWorkplace} placeholder="Employer name" />
          <FormField label="Work Phone" type="tel" value={workPhone} onChange={setWorkPhone} placeholder="Optional" />
        </div>
      </section>

      {/* Emergency contacts (editable) */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider">
            Emergency Contacts
          </h2>
          <button
            onClick={addContact}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-[#7c7c8a] text-center py-4">
            No emergency contacts yet. Tap &ldquo;Add&rdquo; to create one.
          </p>
        ) : (
          <div className="space-y-4">
            {contacts.map((contact, idx) => (
              <div
                key={contact.id ?? `new-${idx}`}
                className="relative border border-[#e8e4df] rounded-lg p-3 space-y-3"
              >
                <button
                  onClick={() => removeContact(idx)}
                  className="absolute top-2 right-2 p-1.5 text-red-400 hover:text-red-600 transition-colors"
                  aria-label="Remove contact"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <FormField
                  label="Name"
                  value={contact.name}
                  onChange={(v) => updateContact(idx, "name", v)}
                  placeholder="Full name"
                />
                <FormField
                  label="Phone"
                  type="tel"
                  value={contact.phone}
                  onChange={(v) => updateContact(idx, "phone", v)}
                  placeholder="0400 000 000"
                />
                <FormField
                  label="Relationship"
                  value={contact.relationship}
                  onChange={(v) => updateContact(idx, "relationship", v)}
                  placeholder="e.g. Grandparent, Aunt"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={updateAccount.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
      >
        {updateAccount.isPending ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Saving...
          </span>
        ) : (
          <>
            <Save className="w-4 h-4" />
            Save Changes
          </>
        )}
      </button>

      {/* Logout */}
      <div className="pt-4 border-t border-[#e8e4df]">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 text-base font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 min-h-[48px]"
        >
          <LogOut className="w-4 h-4" />
          {loggingOut ? "Logging out..." : "Log Out"}
        </button>
      </div>
    </div>
  );
}

// ── Form helpers ─────────────────────────────────────────

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
      />
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-[#7c7c8a]">{label}</span>
        <span className="text-sm font-medium text-[#1a1a2e]">{value}</span>
      </div>
      {note && <p className="text-[11px] text-[#7c7c8a] leading-snug">{note}</p>}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────

function AccountSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
