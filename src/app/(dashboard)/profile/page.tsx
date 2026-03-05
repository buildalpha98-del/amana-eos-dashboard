"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import {
  User,
  Phone,
  MapPin,
  Building2,
  Loader2,
  Save,
  ArrowLeft,
  Shield,
  Landmark,
} from "lucide-react";
import Link from "next/link";
import type { ProfileData } from "@/hooks/useMyPortal";

/* ------------------------------------------------------------------ */
/* Profile Page                                                        */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery<ProfileData>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!userId,
  });

  const isAdmin = session?.user?.role === "owner" || session?.user?.role === "admin";

  // ---- Form state ----
  const [phone, setPhone] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressSuburb, setAddressSuburb] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostcode, setAddressPostcode] = useState("");
  const [superFundName, setSuperFundName] = useState("");
  const [superMemberNumber, setSuperMemberNumber] = useState("");
  const [superUSI, setSuperUSI] = useState("");
  const [bankDetailsNote, setBankDetailsNote] = useState("");

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setPhone(profile.phone ?? "");
      setAddressStreet(profile.addressStreet ?? "");
      setAddressSuburb(profile.addressSuburb ?? "");
      setAddressState(profile.addressState ?? "");
      setAddressPostcode(profile.addressPostcode ?? "");
      setSuperFundName(profile.superFundName ?? "");
      setSuperMemberNumber(profile.superMemberNumber ?? "");
      setSuperUSI(profile.superUSI ?? "");
      setBankDetailsNote(profile.bankDetailsNote ?? "");
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await fetch(`/api/users/${userId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update profile");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-portal"] });
      toast({ description: "Profile updated" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      phone,
      addressStreet,
      addressSuburb,
      addressState,
      addressPostcode,
      superFundName,
      superMemberNumber,
      superUSI,
      bankDetailsNote,
    });
  };

  // Check if form has unsaved changes
  const hasChanges =
    profile &&
    (phone !== (profile.phone ?? "") ||
      addressStreet !== (profile.addressStreet ?? "") ||
      addressSuburb !== (profile.addressSuburb ?? "") ||
      addressState !== (profile.addressState ?? "") ||
      addressPostcode !== (profile.addressPostcode ?? "") ||
      superFundName !== (profile.superFundName ?? "") ||
      superMemberNumber !== (profile.superMemberNumber ?? "") ||
      superUSI !== (profile.superUSI ?? "") ||
      bankDetailsNote !== (profile.bankDetailsNote ?? ""));

  // ---- Loading / Error ----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <User className="w-12 h-12 text-gray-300" />
        <p className="text-gray-500">Unable to load your profile.</p>
        <Link
          href="/my-portal"
          className="text-sm text-[#004E64] hover:underline"
        >
          Back to My Portal
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/my-portal"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Profile</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Update your personal details and superannuation information
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#004E64] hover:bg-[#003d50] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
      </div>

      {/* Read-only info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[#004E64] flex items-center justify-center text-white font-bold text-lg">
            {profile.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{profile.name}</h2>
            <p className="text-sm text-gray-500">{profile.email}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <span className="text-gray-400">Role</span>
            <p className="font-medium text-gray-700 capitalize">{profile.role}</p>
          </div>
          {profile.service && (
            <div>
              <span className="text-gray-400">Service</span>
              <p className="font-medium text-gray-700">{profile.service.name}</p>
            </div>
          )}
          {profile.employmentType && (
            <div>
              <span className="text-gray-400">Employment</span>
              <p className="font-medium text-gray-700 capitalize">
                {profile.employmentType.replace("_", " ")}
              </p>
            </div>
          )}
        </div>
        {!isAdmin && (
          <p className="text-xs text-gray-400 mt-4">
            Name, email, role, and employment details can only be changed by an administrator.
          </p>
        )}
      </div>

      {/* Contact Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Phone className="w-4 h-4 text-gray-400" />
          Contact Details
        </h3>
        <div className="space-y-4">
          <FieldRow label="Phone Number">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0412 345 678"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
            />
          </FieldRow>
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-gray-400" />
          Address
        </h3>
        <div className="space-y-4">
          <FieldRow label="Street">
            <input
              type="text"
              value={addressStreet}
              onChange={(e) => setAddressStreet(e.target.value)}
              placeholder="123 Main Street"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
            />
          </FieldRow>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldRow label="Suburb">
              <input
                type="text"
                value={addressSuburb}
                onChange={(e) => setAddressSuburb(e.target.value)}
                placeholder="Suburb"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </FieldRow>
            <FieldRow label="State">
              <select
                value={addressState}
                onChange={(e) => setAddressState(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64] bg-white"
              >
                <option value="">Select</option>
                <option value="NSW">NSW</option>
                <option value="VIC">VIC</option>
                <option value="QLD">QLD</option>
                <option value="SA">SA</option>
                <option value="WA">WA</option>
                <option value="TAS">TAS</option>
                <option value="NT">NT</option>
                <option value="ACT">ACT</option>
              </select>
            </FieldRow>
            <FieldRow label="Postcode">
              <input
                type="text"
                value={addressPostcode}
                onChange={(e) => setAddressPostcode(e.target.value)}
                placeholder="2000"
                maxLength={4}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </FieldRow>
          </div>
        </div>
      </div>

      {/* Superannuation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-gray-400" />
          Superannuation
        </h3>
        <div className="space-y-4">
          <FieldRow label="Fund Name">
            <input
              type="text"
              value={superFundName}
              onChange={(e) => setSuperFundName(e.target.value)}
              placeholder="e.g. AustralianSuper"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
            />
          </FieldRow>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Member Number">
              <input
                type="text"
                value={superMemberNumber}
                onChange={(e) => setSuperMemberNumber(e.target.value)}
                placeholder="Member number"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </FieldRow>
            <FieldRow label="USI">
              <input
                type="text"
                value={superUSI}
                onChange={(e) => setSuperUSI(e.target.value)}
                placeholder="Unique Superannuation Identifier"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </FieldRow>
          </div>
        </div>
      </div>

      {/* Bank Details Note */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Landmark className="w-4 h-4 text-gray-400" />
          Bank Details
        </h3>
        <FieldRow label="Notes for Admin">
          <textarea
            value={bankDetailsNote}
            onChange={(e) => setBankDetailsNote(e.target.value)}
            placeholder="Provide your bank details or notes for payroll (e.g. BSB, Account Number). This is visible to administrators only."
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64] resize-none"
          />
        </FieldRow>
        <p className="text-xs text-gray-400 mt-2">
          This note is shared with your administrator for payroll processing.
        </p>
      </div>

      {/* Bottom save bar */}
      {hasChanges && (
        <div className="sticky bottom-4 bg-[#004E64] text-white rounded-xl p-4 flex items-center justify-between shadow-lg">
          <p className="text-sm font-medium">You have unsaved changes</p>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-[#004E64] hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field Row                                                           */
/* ------------------------------------------------------------------ */

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
