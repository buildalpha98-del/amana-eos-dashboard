"use client";

import { Plus, Trash2 } from "lucide-react";
import { EnrolmentFormData, EmergencyContact, AuthorisedPerson, EMPTY_EMERGENCY } from "../types";

interface Props {
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
}

function Input({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground/80 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
      />
    </div>
  );
}

export function EmergencyStep({ data, updateData }: Props) {
  const updateContact = (index: number, field: keyof EmergencyContact, value: string) => {
    const contacts = [...data.emergencyContacts];
    contacts[index] = { ...contacts[index], [field]: value };
    updateData({ emergencyContacts: contacts });
  };

  const addContact = () => {
    if (data.emergencyContacts.length < 5) {
      updateData({ emergencyContacts: [...data.emergencyContacts, { ...EMPTY_EMERGENCY }] });
    }
  };

  const removeContact = (index: number) => {
    if (data.emergencyContacts.length <= 1) return;
    updateData({ emergencyContacts: data.emergencyContacts.filter((_, i) => i !== index) });
  };

  const updatePickup = (index: number, field: keyof AuthorisedPerson, value: string) => {
    const list = [...data.authorisedPickup];
    list[index] = { ...list[index], [field]: value };
    updateData({ authorisedPickup: list });
  };

  const addPickup = () => {
    updateData({ authorisedPickup: [...data.authorisedPickup, { name: "", relationship: "", phone: "" }] });
  };

  const removePickup = (index: number) => {
    updateData({ authorisedPickup: data.authorisedPickup.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Emergency Contacts</h3>
        <p className="text-sm text-muted mb-4">
          At least one emergency contact is required. These contacts will be called if we are unable
          to reach the parents/guardians.
        </p>

        {data.emergencyContacts.map((contact, i) => (
          <div key={i} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-muted">
                Emergency Contact {i + 1}
                {i === 0 && <span className="text-red-500 ml-0.5">*</span>}
              </h4>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => removeContact(i)}
                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Full Name" value={contact.name} onChange={(v) => updateContact(i, "name", v)} required={i === 0} />
              <Input label="Relationship" value={contact.relationship} onChange={(v) => updateContact(i, "relationship", v)} required={i === 0} />
              <Input label="Phone" value={contact.phone} onChange={(v) => updateContact(i, "phone", v)} type="tel" required={i === 0} />
              <Input label="Email" value={contact.email} onChange={(v) => updateContact(i, "email", v)} type="email" />
            </div>
          </div>
        ))}

        {data.emergencyContacts.length < 5 && (
          <button
            type="button"
            onClick={addContact}
            className="flex items-center gap-2 text-sm text-brand hover:underline"
          >
            <Plus className="h-4 w-4" /> Add Another Emergency Contact
          </button>
        )}
      </div>

      <hr className="border-border" />

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Authorised Pickup Persons</h3>
        <p className="text-sm text-muted mb-4">
          Other people authorised to collect your child from the service.
        </p>

        {data.authorisedPickup.map((person, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3 items-end">
            <Input label="Full Name" value={person.name} onChange={(v) => updatePickup(i, "name", v)} />
            <Input label="Relationship" value={person.relationship} onChange={(v) => updatePickup(i, "relationship", v)} />
            <Input label="Phone" value={person.phone} onChange={(v) => updatePickup(i, "phone", v)} type="tel" />
            <button
              type="button"
              onClick={() => removePickup(i)}
              className="text-red-500 hover:text-red-700 p-2.5 rounded-lg hover:bg-red-50 transition-colors self-end"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addPickup}
          className="flex items-center gap-2 text-sm text-brand hover:underline"
        >
          <Plus className="h-4 w-4" /> Add Authorised Person
        </button>
      </div>
    </div>
  );
}
