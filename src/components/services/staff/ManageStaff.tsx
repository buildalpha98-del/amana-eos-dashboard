"use client";

/**
 * Staff → Manage staff (2026-10-09, Daniel's OWNA screenshots + approved
 * mock-up). The centre's account runs this: add new staff (invite + start
 * induction, office told), see emails, set or reset clock-in PINs, add
 * photos, fix a name or phone, and see induction and certificate status at
 * a glance. Educators never see this section.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, KeyRound, Pencil, Plus, Search, UserPlus } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { compressImage } from "@/lib/upload-client";
import { toast } from "@/hooks/useToast";
import { isAdminRole } from "@/lib/role-permissions";
import { cn } from "@/lib/utils";
import { serviceTodayISO } from "@/lib/timezone";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { AddServiceStaffDialog } from "../AddServiceStaffDialog";

interface Member {
  userId: string;
  name: string;
  email: string | null;
  avatar: string | null;
  role: string;
  isCentreAccount: boolean;
  membership: { roleAtService: string };
  detail?: {
    pinSet: boolean;
    inductionStatus: string;
    startDate: string | null;
    certs: { expired: number; expiring: number };
  };
}

const INDUCTION: Record<string, { label: string; cls: string }> = {
  cleared: { label: "Cleared", cls: "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200" },
  awaiting_signoff: { label: "Needs sign-off", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  in_training: { label: "In training", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  new_starter: { label: "New starter", cls: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200" },
};

const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold";

export function ManageStaff({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canManage = isAdminRole(role) || (role === "member" && session?.user?.serviceId === serviceId);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<"new" | "existing" | null>(null);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const key = ["service-staff", serviceId, "manage"];

  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/staff?detail=1`),
    retry: 2,
  });
  const people = (data?.members ?? []).filter((m) => !m.isCentreAccount);
  const q = search.trim().toLowerCase();
  const shown = q
    ? people.filter((m) => m.name.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q))
    : people;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-heading text-lg font-semibold text-foreground">
          Manage staff <span className="text-sm font-normal text-muted">({people.length})</span>
        </h2>
        {canManage && (
          <>
            <Button variant="secondary" onClick={() => setAdding("existing")}>
              <UserPlus className="h-4 w-4" />
              From another centre
            </Button>
            <Button className="bg-accent text-brand hover:bg-accent/90" onClick={() => setAdding("new")}>
              <Plus className="h-4 w-4" />
              Add new staff
            </Button>
          </>
        )}
      </div>

      <label className="relative block max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search staff"
          className="min-h-11 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-base"
        />
      </label>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
          {people.length === 0 ? "No staff at this centre yet. Add your first one above." : "Nobody matches that search."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((m) => (
            <StaffRow
              key={m.userId}
              m={m}
              serviceId={serviceId}
              canManage={canManage}
              onPin={() => setPinFor(m)}
              onEdit={() => setEditing(m)}
            />
          ))}
        </ul>
      )}

      {adding === "new" && <AddNewStaffDialog serviceId={serviceId} onClose={() => setAdding(null)} />}
      {adding === "existing" && (
        <AddServiceStaffDialog
          serviceId={serviceId}
          excludeUserIds={new Set(people.map((p) => p.userId))}
          onClose={() => {
            setAdding(null);
          }}
        />
      )}
      {pinFor && <PinDialog member={pinFor} serviceId={serviceId} onClose={() => setPinFor(null)} />}
      {editing && <EditDialog member={editing} serviceId={serviceId} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffRow({
  m,
  serviceId,
  canManage,
  onPin,
  onEdit,
}: {
  m: Member;
  serviceId: string;
  canManage: boolean;
  onPin: () => void;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const d = m.detail;
  const ind = INDUCTION[d?.inductionStatus ?? "cleared"] ?? INDUCTION.cleared;

  async function onPhoto(file: File) {
    setUploading(true);
    try {
      // Shrink phone photos first — the avatar route takes up to 4 MB.
      const form = new FormData();
      form.append("file", await compressImage(file));
      const res = await fetch(`/api/users/${m.userId}/avatar`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't upload that photo");
      qc.invalidateQueries({ queryKey: ["service-staff", serviceId] });
      toast({ description: `Photo added for ${m.name}.` });
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Couldn't upload that photo" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 sm:flex-nowrap">
      <button
        type="button"
        disabled={!canManage || uploading}
        onClick={() => fileRef.current?.click()}
        aria-label={canManage ? `Add a photo of ${m.name}` : m.name}
        className="relative shrink-0"
      >
        {m.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- Blob-hosted avatar
          <img src={m.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-sm font-bold text-white">
            {m.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
          </span>
        )}
        {canManage && (
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-card shadow ring-1 ring-border">
            <Camera className="h-3 w-3 text-brand" aria-hidden />
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhoto(f);
        }}
      />

      <div className="min-w-0 flex-1">
        <Link href={`/staff/${m.userId}`} className="font-semibold text-foreground hover:underline">
          {m.name}
        </Link>
        <p className="truncate text-xs text-muted">
          {m.membership.roleAtService}
          {m.email ? ` · ${m.email}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className={cn(chip, ind.cls)}>{ind.label}</span>
          {d && (
            <span
              className={cn(
                chip,
                d.certs.expired
                  ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                  : d.certs.expiring
                    ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "bg-surface text-foreground",
              )}
            >
              {d.certs.expired
                ? `${d.certs.expired} certificate${d.certs.expired > 1 ? "s" : ""} expired`
                : d.certs.expiring
                  ? `${d.certs.expiring} expiring soon`
                  : "Certificates current"}
            </span>
          )}
          {d && (
            <span
              className={cn(
                chip,
                d.pinSet ? "bg-surface text-foreground" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
              )}
            >
              {d.pinSet ? "Clock-in PIN set" : "No clock-in PIN"}
            </span>
          )}
        </div>
      </div>

      {canManage && (
        <div className="flex w-full gap-2 sm:w-auto">
          <Button size="sm" variant="secondary" className="flex-1 sm:flex-none" onClick={onPin}>
            <KeyRound className="h-4 w-4" />
            {d?.pinSet ? "Change PIN" : "Set PIN"}
          </Button>
          <Button size="sm" variant="ghost" className="flex-1 sm:flex-none" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      )}
    </li>
  );
}

function AddNewStaffDialog({ serviceId, onClose }: { serviceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState(serviceTodayISO());
  const add = useMutation({
    mutationFn: () =>
      mutateApi("/api/users", {
        method: "POST",
        // The route takes an ISO datetime: midnight UTC of the chosen day.
        body: {
          name: name.trim(),
          email: email.trim(),
          role: "staff",
          serviceId,
          newStarter: true,
          startDate: `${startDate}T00:00:00.000Z`,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-staff", serviceId] });
      qc.invalidateQueries({ queryKey: ["staff-inductions", serviceId] });
      toast({ description: `${name.trim()} added. They've been emailed an invite and their induction has started.` });
      onClose();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const ok = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Add new staff</DialogTitle>
        <DialogDescription>
          They get an email to set up their login, and start their induction. Head office is told.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) add.mutate();
          }}
        >
          <label className="block text-sm font-medium text-foreground">
            Full name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            First day
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ok || add.isPending}>
              {add.isPending ? "Adding…" : "Add and send invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PinDialog({ member, serviceId, onClose }: { member: Member; serviceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const done = () => {
    qc.invalidateQueries({ queryKey: ["service-staff", serviceId] });
    onClose();
  };
  const set = useMutation({
    mutationFn: () => mutateApi(`/api/users/${member.userId}/kiosk-pin`, { method: "POST", body: { pin } }),
    onSuccess: () => {
      toast({ description: `PIN set for ${member.name}. Tell them in person; they can change it on their Profile.` });
      done();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const clear = useMutation({
    mutationFn: () => mutateApi(`/api/users/${member.userId}/reset-kiosk-pin`, { method: "POST" }),
    onSuccess: () => {
      toast({ description: `${member.name}'s PIN was cleared. They can set a new one on their Profile.` });
      done();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Clock-in PIN for {member.name}</DialogTitle>
        <DialogDescription>Four digits, used on the door iPad and the clock-in kiosk.</DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{4}$/.test(pin)) set.mutate();
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            aria-label="New 4-digit PIN"
            className="block min-h-14 w-full rounded-lg border border-border bg-card px-3 text-center text-2xl tracking-[0.5em]"
          />
          <div className="flex flex-wrap justify-between gap-2">
            {member.detail?.pinSet ? (
              <Button type="button" variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>
                Clear their PIN
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={!/^\d{4}$/.test(pin) || set.isPending}>
              Save PIN
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ member, serviceId, onClose }: { member: Member; serviceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState("");
  const save = useMutation({
    mutationFn: () =>
      mutateApi(`/api/users/${member.userId}/profile`, {
        method: "PATCH",
        body: { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-staff", serviceId] });
      toast({ description: "Saved." });
      onClose();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Edit {member.name}</DialogTitle>
        <DialogDescription>
          Email, bank and super details are changed by the staff member on their Profile, or by head office.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length > 1) save.mutate();
          }}
        >
          <label className="block text-sm font-medium text-foreground">
            Full name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Phone (leave blank to keep)
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Link href={`/staff/${member.userId}`} className="text-sm font-medium text-brand underline underline-offset-2">
              Open full profile
            </Link>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
