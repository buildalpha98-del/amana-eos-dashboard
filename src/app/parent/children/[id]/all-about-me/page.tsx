"use client";

import { use, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Loader2, Save, Sparkles } from "lucide-react";

interface AllAboutMe {
  id: string;
  childId: string;
  nickname: string | null;
  favouriteFood: string | null;
  favouriteToys: string | null;
  favouriteSubjects: string | null;
  hobbies: string | null;
  fears: string | null;
  calmingTechniques: string | null;
  additionalNotes: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

type FormState = {
  nickname: string;
  favouriteFood: string;
  favouriteToys: string;
  favouriteSubjects: string;
  hobbies: string;
  fears: string;
  calmingTechniques: string;
  additionalNotes: string;
};

const EMPTY: FormState = {
  nickname: "",
  favouriteFood: "",
  favouriteToys: "",
  favouriteSubjects: "",
  hobbies: "",
  fears: "",
  calmingTechniques: "",
  additionalNotes: "",
};

function fromServer(rec: AllAboutMe | null): FormState {
  if (!rec) return EMPTY;
  return {
    nickname: rec.nickname ?? "",
    favouriteFood: rec.favouriteFood ?? "",
    favouriteToys: rec.favouriteToys ?? "",
    favouriteSubjects: rec.favouriteSubjects ?? "",
    hobbies: rec.hobbies ?? "",
    fears: rec.fears ?? "",
    calmingTechniques: rec.calmingTechniques ?? "",
    additionalNotes: rec.additionalNotes ?? "",
  };
}

export default function AllAboutMePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: childId } = use(params);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, error } = useQuery<{ allAboutMe: AllAboutMe | null }>({
    queryKey: ["parent-all-about-me", childId],
    queryFn: () =>
      fetchApi<{ allAboutMe: AllAboutMe | null }>(
        `/api/parent/children/${childId}/all-about-me`,
      ),
    retry: 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) setForm(fromServer(data.allAboutMe));
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: FormState) => {
      return await mutateApi<{ allAboutMe: AllAboutMe }>(
        `/api/parent/children/${childId}/all-about-me`,
        { method: "PATCH", body: next },
      );
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't save your answers",
      });
    },
    onSuccess: (res) => {
      queryClient.setQueryData(["parent-all-about-me", childId], res);
      toast({ description: "All About Me saved — thank you!" });
    },
  });

  function handleField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    save.mutate(form);
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-[color:var(--color-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        {(error as Error).message || "Couldn't load this child"}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <header className="space-y-1">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          All About Me
        </div>
        <h1 className="text-2xl font-bold text-[color:var(--color-foreground)]">
          Help us welcome your child
        </h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          Filling this in before the first day helps our educators greet your
          child by nickname, swap a snack they don't like, and steer clear of
          known fears. Nothing here is required — share what feels useful.
        </p>
        {data?.allAboutMe?.submittedAt && (
          <p className="text-xs text-[color:var(--color-muted)]">
            First saved {new Date(data.allAboutMe.submittedAt).toLocaleDateString("en-AU")}
            {data.allAboutMe.updatedAt && data.allAboutMe.updatedAt !== data.allAboutMe.submittedAt && (
              <> · Last updated {new Date(data.allAboutMe.updatedAt).toLocaleDateString("en-AU")}</>
            )}
          </p>
        )}
      </header>

      <div className="space-y-4">
        <Field
          label="What does your child like to be called?"
          hint="A nickname or short version — e.g. 'Sami' instead of 'Osman'."
          value={form.nickname}
          onChange={(v) => handleField("nickname", v)}
        />
        <Field
          label="Favourite foods"
          hint="Helps with afternoon tea and birthdays."
          value={form.favouriteFood}
          onChange={(v) => handleField("favouriteFood", v)}
        />
        <Field
          label="Favourite toys or activities"
          value={form.favouriteToys}
          onChange={(v) => handleField("favouriteToys", v)}
        />
        <Field
          label="Favourite subjects at school"
          value={form.favouriteSubjects}
          onChange={(v) => handleField("favouriteSubjects", v)}
        />
        <Field
          label="Hobbies"
          value={form.hobbies}
          onChange={(v) => handleField("hobbies", v)}
        />
        <Field
          label="Anything that scares or upsets them"
          hint="Loud noises, dogs, separation, etc. — totally optional."
          multiline
          value={form.fears}
          onChange={(v) => handleField("fears", v)}
        />
        <Field
          label="What helps when they're upset?"
          hint="A quiet corner, a familiar song, deep breaths, a hug — whatever works for your family."
          multiline
          value={form.calmingTechniques}
          onChange={(v) => handleField("calmingTechniques", v)}
        />
        <Field
          label="Anything else we should know?"
          multiline
          value={form.additionalNotes}
          onChange={(v) => handleField("additionalNotes", v)}
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[color:var(--color-brand)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  multiline,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-[color:var(--color-foreground)]">
        {label}
      </span>
      {hint && <span className="block text-xs text-[color:var(--color-muted)]">{hint}</span>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full mt-1 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:ring-2 focus:ring-[color:var(--color-brand)] focus:border-transparent resize-none"
          placeholder=""
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full mt-1 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:ring-2 focus:ring-[color:var(--color-brand)] focus:border-transparent min-h-[44px]"
        />
      )}
    </label>
  );
}
