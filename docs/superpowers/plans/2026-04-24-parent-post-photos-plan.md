# Child Photo Uploads (Educator → Parent Timeline) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let centre staff attach up to 6 photos when creating a ParentPost; parents see them as a responsive gallery with a swipe-enabled fullscreen lightbox.

**Architecture:** Photos are uploaded through the existing authenticated `/api/upload/image` endpoint (hardened with EXIF strip + 5MB cap) and stored on Vercel Blob. URLs are persisted on `ParentPost.mediaUrls` (already present in schema). The parent timeline API `/api/parent/timeline` already returns `mediaUrls` untouched — only the renderer needs to change. A new `Lightbox` primitive is added to `src/components/parent/ui/` and consumed by `TimelineWidget`.

**Tech Stack:** Next.js 16 / TypeScript / Prisma 5.22 / `sharp` (new — EXIF strip + re-encode) / `@vercel/blob` / TanStack Query / `next/image` / Vitest 4 / React Testing Library.

---

## Scope & Non-Goals

**In scope (ship as 4 commits):**
1. Harden `POST /api/upload/image` (sharp EXIF strip, 5 MB cap, image-only MIMEs, unit test).
2. Multi-image upload UI in `CreateParentPostForm` (max 6, per-image remove, client-side size check).
3. `TimelineWidget` renders `mediaUrls` as a responsive gallery (1 / 2 / 3 / 4+ layouts, `+N` overlay).
4. `Lightbox` primitive (keyboard nav, swipe, reduced-motion, tap-outside close, counter).

**Out of scope:** videos, reordering after upload, per-image alt text, download button, AI face-blurring.

**Gotchas to respect:**
- Parent visibility is enforced in `src/app/api/parent/timeline/route.ts` (the `where: { serviceId in … , OR: [{isCommunity}, {tags.some…}] }` clause). Do not bypass.
- Vercel Blob has a **4.5 MB direct-upload cap on Hobby** plans. The hard spec says 5 MB; since Amana runs Pro, 5 MB is safe. Document the Hobby cap in the PR description.
- Mobile Safari: tap-hold conflicts with click — use `onClick` only; avoid `onTouchEnd`/`onTouchMove` event handlers that preventDefault on the same element.
- `next/image` with Vercel Blob URLs requires `images.remotePatterns` in `next.config.ts` (currently absent). Either add the remotePattern or use `<img>`. This plan adds the remotePattern.

---

## File Map

**Create:**
- `src/components/parent/ui/Lightbox.tsx` — fullscreen modal primitive
- `src/components/parent/ui/index.ts` — barrel export for parent UI primitives
- `src/components/parent/TimelinePostMedia.tsx` — gallery renderer (keeps TimelineWidget focused)
- `src/__tests__/api/upload-image.test.ts` — route unit tests
- `src/__tests__/components/Lightbox.test.tsx` — navigation + keyboard tests
- `src/__tests__/components/TimelinePostMedia.test.tsx` — layout selector tests at N=1..6
- `src/__tests__/components/CreateParentPostForm.test.tsx` — upload/remove/oversize tests

**Modify:**
- `src/app/api/upload/image/route.ts` — EXIF strip + sharp re-encode + 5 MB cap + tightened MIME list
- `src/lib/schemas/parent-post.ts` — `mediaUrls.max(6)` (was 10)
- `src/components/services/CreateParentPostForm.tsx` — image upload section
- `src/components/parent/TimelineWidget.tsx` — inject `<TimelinePostMedia>` into each card + Lightbox state
- `src/__tests__/api/parent-posts.test.ts` — extend with "rejects >6 mediaUrls" case
- `next.config.ts` — `images.remotePatterns` for `*.public.blob.vercel-storage.com`
- `package.json` — `sharp` dependency

---

## Chunk 1: Upload hardening & schema tightening

### Task 1.1: Install `sharp`

- [ ] **Step 1: Install sharp**

Run: `npm install sharp`

Expected: `sharp@^0.33.x` added to `dependencies`.

- [ ] **Step 2: Verify sharp imports at runtime**

Run: `node -e "console.log(require('sharp').format.jpeg.input.file)"`
Expected: `true` (sharp is installed correctly with JPEG support).

---

### Task 1.2: Harden `/api/upload/image` route

**Files:**
- Modify: `src/app/api/upload/image/route.ts`
- Create: `src/__tests__/api/upload-image.test.ts`

Current behavior: accepts JPEG/PNG/WebP/HEIC/HEIF, 10 MB cap, validates magic bytes only. No EXIF strip.

Target behavior: accept JPEG/PNG/WebP/HEIC (drop HEIF alias), 5 MB cap, run buffer through `sharp().rotate().toFormat(...)` to strip EXIF and re-encode; return `{ url }`.

- [ ] **Step 1: Write the failing test — rejects oversize**

Create `src/__tests__/api/upload-image.test.ts` starting with:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

const mockUpload = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadFile: (...args: unknown[]) => mockUpload(...args),
  deleteFile: vi.fn(),
}));

// sharp mock — just returns the buffer as-is so we can assert wiring.
vi.mock("sharp", () => {
  const fn = () => ({
    rotate: () => ({
      jpeg: () => ({ toBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]) }),
      png: () => ({ toBuffer: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }),
      webp: () => ({ toBuffer: async () => Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]) }),
    }),
  });
  return { default: fn };
});

import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { POST } from "@/app/api/upload/image/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function jpegBytes(size = 10): Uint8Array {
  const out = new Uint8Array(size);
  out[0] = 0xff; out[1] = 0xd8; out[2] = 0xff; out[3] = 0xe0;
  return out;
}

function createFormDataRequest(formData: FormData): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/upload/image", { method: "POST", body: formData }),
  );
}

describe("POST /api/upload/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    mockUpload.mockResolvedValue({ url: "https://abc.public.blob.vercel-storage.com/foo.jpg", size: 1024 });
  });

  it("rejects files larger than 5MB", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File([jpegBytes(5 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/5MB/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (still 10 MB cap)**

Run: `npm test -- --run src/__tests__/api/upload-image.test.ts`
Expected: FAIL — the route still accepts >5 MB.

- [ ] **Step 3: Update the route to 5 MB cap, sharp pipeline, tightened MIME**

Replace `src/app/api/upload/image/route.ts` with:

```typescript
import { NextResponse } from "next/server";
import path from "path";
import sharp from "sharp";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

/**
 * Accepted MIME types for parent-post photo uploads.
 * HEIC is accepted on the wire (iOS Safari sends it) but is transcoded to JPEG
 * on the server so parents can view it on any browser.
 */
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/** sharp output format per input MIME. HEIC → JPEG for browser compatibility. */
function outputFormat(mime: string): "jpeg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpeg"; // image/jpeg and image/heic both fall through to jpeg
}

function outputExt(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

/**
 * POST /api/upload/image — upload a photo for a ParentPost.
 *
 * Pipeline: validate MIME, validate size, magic-byte check, sharp.rotate()+re-encode
 * (strips EXIF metadata incl. GPS, applies orientation), upload to public Vercel Blob.
 *
 * HEIC input is always transcoded to JPEG because most desktop browsers cannot render it.
 */
export const POST = withApiAuth(async (req) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    throw ApiError.badRequest("No file provided");
  }

  if (!IMAGE_TYPES.has(file.type)) {
    throw ApiError.badRequest(
      `File type ${file.type} is not allowed. Accepted: JPEG, PNG, WebP, HEIC.`,
    );
  }

  if (file.size > MAX_SIZE) {
    throw ApiError.badRequest("File size exceeds 5MB limit");
  }

  const bytes = await file.arrayBuffer();

  // HEIC files don't match the magic-byte table in validateFileContent — skip that
  // check for HEIC and let sharp do the real content validation at decode time.
  if (file.type !== "image/heic" && !validateFileContent(bytes, file.type)) {
    throw ApiError.badRequest("File content does not match declared type");
  }

  // Strip EXIF (incl. GPS) by re-encoding through sharp. `.rotate()` with no arg
  // applies the existing orientation then drops the metadata on output.
  const fmt = outputFormat(file.type);
  let processed: Buffer;
  try {
    const pipeline = sharp(Buffer.from(bytes)).rotate();
    processed =
      fmt === "png"
        ? await pipeline.png().toBuffer()
        : fmt === "webp"
          ? await pipeline.webp().toBuffer()
          : await pipeline.jpeg({ quality: 85 }).toBuffer();
  } catch {
    throw ApiError.badRequest("Could not decode image");
  }

  const ext = outputExt(file.type);
  const originalExt = path.extname(file.name) || ext;
  const baseName = path
    .basename(file.name, originalExt)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;

  const { url } = await uploadFile(processed, uniqueName, {
    contentType: fmt === "png" ? "image/png" : fmt === "webp" ? "image/webp" : "image/jpeg",
    folder: "parent-posts",
    access: "public",
  });

  return NextResponse.json({ url });
});
```

- [ ] **Step 4: Run failing test — expect PASS**

Run: `npm test -- --run src/__tests__/api/upload-image.test.ts`
Expected: PASS for "rejects files larger than 5MB".

- [ ] **Step 5: Add remaining route tests**

Append to `src/__tests__/api/upload-image.test.ts`:

```typescript
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const fd = new FormData();
    fd.append("file", new File([jpegBytes()], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-image MIME (text/plain)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File(["hello"], "note.txt", { type: "text/plain" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("returns 400 when magic bytes don't match MIME (PNG disguised as JPEG)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "fake.jpg", {
        type: "image/jpeg",
      }),
    );
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not match/i);
  });

  it("uploads a valid JPEG through the sharp pipeline", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File([jpegBytes()], "photo.jpg", { type: "image/jpeg" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\//);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [, uniqueName, opts] = mockUpload.mock.calls[0];
    expect(uniqueName).toMatch(/\.jpg$/);
    expect(opts.folder).toBe("parent-posts");
    expect(opts.access).toBe("public");
  });
```

- [ ] **Step 6: Run all upload-image tests — expect PASS**

Run: `npm test -- --run src/__tests__/api/upload-image.test.ts`
Expected: 4 passing.

---

### Task 1.3: Tighten schema — mediaUrls max(6)

**Files:**
- Modify: `src/lib/schemas/parent-post.ts`
- Modify: `src/__tests__/api/parent-posts.test.ts`

- [ ] **Step 1: Write the failing test — rejects 7 mediaUrls**

Append to the `POST /api/services/[id]/parent-posts` describe block in `src/__tests__/api/parent-posts.test.ts`:

```typescript
  it("rejects more than 6 mediaUrls", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    const mediaUrls = Array.from({ length: 7 }, (_, i) => `https://abc${i}.public.blob.vercel-storage.com/img-${i}.jpg`);
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Gallery", content: "test", isCommunity: true, mediaUrls },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.mediaUrls).toBeDefined();
  });

  it("accepts up to 6 mediaUrls", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.service.findUnique.mockResolvedValue({ id: SERVICE_ID });
    prismaMock.parentPost.create.mockResolvedValue({ id: "p-gallery", tags: [], author: null });
    prismaMock.activityLog.create.mockResolvedValue({});
    const mediaUrls = Array.from({ length: 6 }, (_, i) => `https://abc${i}.public.blob.vercel-storage.com/img-${i}.jpg`);
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Gallery", content: "test", isCommunity: true, mediaUrls },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(201);
  });
```

- [ ] **Step 2: Run test — expect 7-case to FAIL (schema currently max 10)**

Run: `npm test -- --run src/__tests__/api/parent-posts.test.ts -t "rejects more than 6"`
Expected: FAIL — currently allows 10.

- [ ] **Step 3: Update schema max to 6**

In `src/lib/schemas/parent-post.ts`, change both occurrences of `.max(10, "Maximum 10 media files")` to `.max(6, "Maximum 6 media files")`.

- [ ] **Step 4: Run test — expect PASS**

Run: `npm test -- --run src/__tests__/api/parent-posts.test.ts`
Expected: all passing (including the new two).

---

### Task 1.4: Configure `next/image` for Vercel Blob

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add remotePatterns for Vercel Blob**

In `next.config.ts`, extend `nextConfig`:

```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ["jsdom", "mammoth"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async headers() { /* unchanged */ },
};
```

- [ ] **Step 2: Verify build still compiles**

Run: `npm run build` (or `npx next build` if migrate deploy fails in CI — just the Next part matters here).

**Note:** `npm run build` runs `prisma migrate deploy` which hits the real DB. For a quick typecheck-only pass use `npx tsc --noEmit`.

---

### Task 1.5: Commit Chunk 1

- [ ] **Step 1: Stage and commit**

```bash
git add package.json package-lock.json src/app/api/upload/image/route.ts \
        src/lib/schemas/parent-post.ts src/__tests__/api/upload-image.test.ts \
        src/__tests__/api/parent-posts.test.ts next.config.ts
git commit -m "$(cat <<'EOF'
feat(upload): harden /api/upload/image for parent photos

- Strip EXIF (incl. GPS) and re-encode via sharp
- Tighten MIME allowlist to JPEG/PNG/WebP/HEIC and drop HEIF alias
- Lower size cap to 5 MB (Vercel Blob Hobby: 4.5 MB direct — note in PR)
- HEIC input transcoded to JPEG for cross-browser viewing
- Parent post schema: mediaUrls max 6 (was 10)
- next.config.ts: remotePattern for *.public.blob.vercel-storage.com

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: CreateParentPostForm — multi-image upload

### Task 2.1: Add upload UI + state to the form

**Files:**
- Modify: `src/components/services/CreateParentPostForm.tsx`

**Design notes:**
- Add `mediaUrls` state (local) that syncs into the form via `setValue("mediaUrls", …)`.
- New `<ImagePicker>` section below the Content field: grid of thumbnail tiles plus a dashed "+" tile.
- On file pick: validate client-side (count ≤ 6 total, each ≤ 5 MB, MIME starts with `image/`), POST to `/api/upload/image` one file at a time (simpler than parallel; still fast enough for 6), append resulting URL.
- Show per-thumbnail upload progress via an overlay spinner; show a red border on failed tiles with a retry button.
- `X` button on each thumbnail removes the URL from the list.

- [ ] **Step 1: Write the failing component test — 6-image limit**

Create `src/__tests__/components/CreateParentPostForm.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock hooks the form depends on
vi.mock("@/hooks/useParentPosts", () => ({
  useCreateParentPost: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateParentPost: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ data: { children: [] } }),
}));
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

// Mock fetch for /api/upload/image
const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { CreateParentPostForm } from "@/components/services/CreateParentPostForm";

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreateParentPostForm serviceId="svc-1" open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

function makeImage(sizeBytes: number, name = "x.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("CreateParentPostForm image upload", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("rejects files over 5MB on the client (no network call)", async () => {
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeImage(5 * 1024 * 1024 + 1)] } });
    await waitFor(() => expect(screen.getByText(/too large/i)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads and shows a thumbnail for each picked file (up to 6)", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ url: `https://abc.public.blob.vercel-storage.com/x-${Math.random()}.jpg` }),
      headers: new Headers({ "content-type": "application/json" }),
    }));
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    const files = Array.from({ length: 3 }, (_, i) => makeImage(1024, `a${i}.jpg`));
    fireEvent.change(fileInput, { target: { files } });
    await waitFor(() => expect(screen.getAllByRole("img", { name: /uploaded photo/i })).toHaveLength(3));
  });

  it("stops accepting files once 6 are queued", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ url: `https://abc.public.blob.vercel-storage.com/x-${Math.random()}.jpg` }),
      headers: new Headers({ "content-type": "application/json" }),
    }));
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: Array.from({ length: 6 }, (_, i) => makeImage(1024, `a${i}.jpg`)) } });
    await waitFor(() => expect(screen.getAllByRole("img", { name: /uploaded photo/i })).toHaveLength(6));
    // 7th should be rejected (message appears, no new thumbnail)
    fireEvent.change(fileInput, { target: { files: [makeImage(1024, "seventh.jpg")] } });
    await waitFor(() => expect(screen.getByText(/maximum.*6/i)).toBeInTheDocument());
    expect(screen.getAllByRole("img", { name: /uploaded photo/i })).toHaveLength(6);
  });

  it("removes a thumbnail when its X is clicked", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ url: `https://abc.public.blob.vercel-storage.com/x-${Math.random()}.jpg` }),
      headers: new Headers({ "content-type": "application/json" }),
    }));
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeImage(1024, "a.jpg"), makeImage(1024, "b.jpg")] } });
    await waitFor(() => expect(screen.getAllByRole("img", { name: /uploaded photo/i })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: /remove photo/i })[0]);
    await waitFor(() => expect(screen.getAllByRole("img", { name: /uploaded photo/i })).toHaveLength(1));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (picker doesn't exist yet)**

Run: `npm test -- --run src/__tests__/components/CreateParentPostForm.test.tsx`
Expected: FAIL — `screen.getByLabelText(/add photos/i)` throws.

- [ ] **Step 3: Implement the image picker in the form**

Edit `src/components/services/CreateParentPostForm.tsx`:

- Add state:
  ```ts
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0); // count of in-flight uploads
  const [uploadError, setUploadError] = useState<string | null>(null);
  ```
- Sync to form: in the existing `useEffect([editingPost])` add `setMediaUrls(editingPost?.mediaUrls ?? [])`, and in `onSubmit` swap `data.mediaUrls` for `mediaUrls`.
- Add a handler:
  ```ts
  const MAX_IMAGES = 6;
  const MAX_SIZE = 5 * 1024 * 1024;

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setUploadError(null);

    const remaining = MAX_IMAGES - mediaUrls.length - uploading;
    if (remaining <= 0) {
      setUploadError(`Maximum ${MAX_IMAGES} photos per post.`);
      return;
    }

    const picked = Array.from(files).slice(0, remaining);
    if (picked.length < files.length) {
      setUploadError(`Maximum ${MAX_IMAGES} photos per post.`);
    }

    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        setUploadError(`${file.name} is not an image.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setUploadError(`${file.name} is too large (max 5 MB).`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/image", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error || "Upload failed");
        }
        const { url } = (await res.json()) as { url: string };
        setMediaUrls((prev) => [...prev, url]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removeImage(index: number) {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  }
  ```
- Render (insert above the "Type/Community Post" grid):
  ```tsx
  <FormField label="Photos">
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {mediaUrls.map((url, i) => (
        <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Uploaded photo" className="w-full h-full object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => removeImage(i)}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
          >
            ×
          </button>
        </div>
      ))}
      {Array.from({ length: uploading }).map((_, i) => (
        <div key={`uploading-${i}`} className="aspect-square rounded-lg border border-border bg-surface flex items-center justify-center text-xs text-muted">
          Uploading…
        </div>
      ))}
      {mediaUrls.length + uploading < MAX_IMAGES && (
        <label className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-surface">
          <span className="sr-only">Add photos</span>
          <span aria-hidden className="text-2xl text-muted">+</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            aria-label="Add photos"
          />
        </label>
      )}
    </div>
    {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
    <p className="mt-1 text-xs text-muted">Up to {MAX_IMAGES} photos, 5 MB each.</p>
  </FormField>
  ```

- Update `onSubmit`:
  ```ts
  const payload = {
    ...data,
    mediaUrls,
    childIds: data.isCommunity ? [] : selectedChildIds,
  };
  ```

- Update `handleClose` to also clear `setMediaUrls([])` and `setUploadError(null)`.

- [ ] **Step 4: Run component tests — expect PASS**

Run: `npm test -- --run src/__tests__/components/CreateParentPostForm.test.tsx`
Expected: all 4 passing.

- [ ] **Step 5: Commit Chunk 2**

```bash
git add src/components/services/CreateParentPostForm.tsx \
        src/__tests__/components/CreateParentPostForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(services): multi-image upload in CreateParentPostForm

- "+" tile opens a multi-select image picker
- Per-image thumbnail with remove button
- Client-side 6-image + 5 MB limits before hitting /api/upload/image
- Inline error when a file is rejected or upload fails

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: TimelineWidget gallery

### Task 3.1: Build `TimelinePostMedia` with layout selector

**Files:**
- Create: `src/components/parent/TimelinePostMedia.tsx`
- Create: `src/__tests__/components/TimelinePostMedia.test.tsx`

Layouts:
- 1 image → single full-width 16:9 tile
- 2 images → two side-by-side 1:1 tiles
- 3 images → grid: 1 large left (full height), 2 stacked right
- 4 images → 2×2 grid
- 5+ images → 2×2 grid with `+N` overlay on the 4th tile (N = count − 3 extras)

- [ ] **Step 1: Write the failing layout tests**

Create `src/__tests__/components/TimelinePostMedia.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelinePostMedia } from "@/components/parent/TimelinePostMedia";

function urls(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://abc.public.blob.vercel-storage.com/img-${i}.jpg`);
}

describe("TimelinePostMedia layouts", () => {
  const onOpen = vi.fn();

  it("renders nothing for 0 images", () => {
    const { container } = render(<TimelinePostMedia urls={[]} onOpen={onOpen} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("single: one full-width 16:9 tile", () => {
    render(<TimelinePostMedia urls={urls(1)} onOpen={onOpen} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(screen.getByTestId("gallery")).toHaveAttribute("data-layout", "single");
  });

  it("double: two 1:1 tiles", () => {
    render(<TimelinePostMedia urls={urls(2)} onOpen={onOpen} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute("data-layout", "double");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("triple: 1 large + 2 stacked", () => {
    render(<TimelinePostMedia urls={urls(3)} onOpen={onOpen} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute("data-layout", "triple");
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("quad: 2x2 grid", () => {
    render(<TimelinePostMedia urls={urls(4)} onOpen={onOpen} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute("data-layout", "quad");
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });

  it("5+ images: 2x2 grid, +N overlay on the 4th tile", () => {
    render(<TimelinePostMedia urls={urls(6)} onOpen={onOpen} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute("data-layout", "quad");
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("click opens lightbox at the tapped index", () => {
    const onOpen = vi.fn();
    render(<TimelinePostMedia urls={urls(3)} onOpen={onOpen} />);
    const tiles = screen.getAllByRole("button", { name: /view photo/i });
    tiles[1].click();
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (component missing)**

Run: `npm test -- --run src/__tests__/components/TimelinePostMedia.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TimelinePostMedia`**

Create `src/components/parent/TimelinePostMedia.tsx`:

```tsx
"use client";

import Image from "next/image";

interface Props {
  urls: string[];
  onOpen: (index: number) => void;
}

type Layout = "single" | "double" | "triple" | "quad";

function pickLayout(n: number): Layout | null {
  if (n <= 0) return null;
  if (n === 1) return "single";
  if (n === 2) return "double";
  if (n === 3) return "triple";
  return "quad"; // 4+
}

export function TimelinePostMedia({ urls, onOpen }: Props) {
  const layout = pickLayout(urls.length);
  if (!layout) return null;

  // How many tiles to render. For 4+ we always show 4.
  const visibleCount = layout === "quad" ? 4 : urls.length;
  const overflow = urls.length - visibleCount;

  const wrap = "mt-3 rounded-xl overflow-hidden";
  const gridClass: Record<Layout, string> = {
    single: "",
    double: "grid grid-cols-2 gap-0.5",
    triple: "grid grid-cols-2 grid-rows-2 gap-0.5",
    quad: "grid grid-cols-2 grid-rows-2 gap-0.5",
  };

  return (
    <div data-testid="gallery" data-layout={layout} className={`${wrap} ${gridClass[layout]}`}>
      {urls.slice(0, visibleCount).map((url, i) => {
        const isLastOfQuad = layout === "quad" && i === 3 && overflow > 0;
        const extraClasses =
          layout === "single"
            ? "aspect-video"
            : layout === "triple" && i === 0
              ? "row-span-2 aspect-square"
              : "aspect-square";
        return (
          <button
            key={url}
            type="button"
            aria-label={`View photo ${i + 1}`}
            onClick={() => onOpen(i)}
            className={`relative ${extraClasses} overflow-hidden`}
          >
            <Image
              src={url}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
            />
            {isLastOfQuad && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-lg font-semibold">
                +{overflow}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- --run src/__tests__/components/TimelinePostMedia.test.tsx`
Expected: 7 passing.

---

### Task 3.2: Wire `TimelinePostMedia` + `Lightbox` state into `TimelineWidget`

**Files:**
- Modify: `src/components/parent/TimelineWidget.tsx`

**Note:** Lightbox is built in Chunk 4. For Chunk 3, leave a TODO placeholder that only tracks state and opens a `<dialog>`-style overlay — it will be replaced by `<Lightbox>` in Chunk 4.

Simpler plan: build the whole `TimelinePostMedia` + `Lightbox` together to avoid a throw-away placeholder. Re-order Chunks so Lightbox comes first, then wire it in.

**Revised order:** Chunk 4 builds Lightbox first, Chunk 3 then consumes it. (Adjusting below.)

> The remainder of this section will be filled in after Chunk 4.

---

## Chunk 4: Lightbox primitive (build first, wire in Chunk 3-continued)

### Task 4.1: Build `Lightbox.tsx`

**Files:**
- Create: `src/components/parent/ui/Lightbox.tsx`
- Create: `src/components/parent/ui/index.ts`
- Create: `src/__tests__/components/Lightbox.test.tsx`

**Contract:**
- Props: `{ urls: string[]; openIndex: number | null; onClose: () => void }`.
- Renders nothing when `openIndex === null`.
- Full-viewport fixed overlay, `z-50`, backdrop `bg-black/95`, keyboard listeners only while open.
- Keyboard: `Escape` closes; `ArrowLeft`/`ArrowRight` navigates with clamp (no wraparound).
- Click on backdrop closes; clicks on the image itself do not.
- Swipe: horizontal swipe threshold 50px → prev/next; vertical swipe-down >80px → close.
- Counter: `"i+1 of N"` centered at bottom.
- `prefers-reduced-motion`: no transition on image change when matched.
- Prev/Next buttons are hidden when at the boundary (index 0 or N-1).

- [ ] **Step 1: Write the failing navigation tests**

Create `src/__tests__/components/Lightbox.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Lightbox } from "@/components/parent/ui/Lightbox";

const urls = [
  "https://abc.public.blob.vercel-storage.com/a.jpg",
  "https://abc.public.blob.vercel-storage.com/b.jpg",
  "https://abc.public.blob.vercel-storage.com/c.jpg",
];

describe("Lightbox", () => {
  it("renders nothing when openIndex is null", () => {
    const { container } = render(<Lightbox urls={urls} openIndex={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the image at openIndex with counter", () => {
    render(<Lightbox urls={urls} openIndex={1} onClose={() => {}} />);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /photo 2 of 3/i })).toHaveAttribute("src", urls[1]);
  });

  it("ArrowRight advances to next image", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("ArrowLeft goes to previous image", () => {
    render(<Lightbox urls={urls} openIndex={2} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("ArrowLeft at index 0 stays at 0 (no wraparound)", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("ArrowRight at last index stays at last (no wraparound)", () => {
    render(<Lightbox urls={urls} openIndex={2} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<Lightbox urls={urls} openIndex={0} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    render(<Lightbox urls={urls} openIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("lightbox-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Prev button is hidden at index 0", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
  });

  it("Next button is hidden at last index", () => {
    render(<Lightbox urls={urls} openIndex={2} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
  });

  it("Next button advances when clicked", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npm test -- --run src/__tests__/components/Lightbox.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `Lightbox`**

Create `src/components/parent/ui/Lightbox.tsx`:

```tsx
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  urls: string[];
  openIndex: number | null;
  onClose: () => void;
}

export function Lightbox({ urls, openIndex, onClose }: Props) {
  const [index, setIndex] = useState(openIndex ?? 0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (openIndex !== null) setIndex(openIndex);
  }, [openIndex]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(urls.length - 1, i + 1)),
    [urls.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, onClose, goPrev, goNext]);

  if (openIndex === null) return null;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dy) > 80 && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  const atFirst = index <= 0;
  const atLast = index >= urls.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      data-testid="lightbox-backdrop"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 p-2 text-white/90 hover:text-white"
      >
        <X className="w-6 h-6" />
      </button>

      {!atFirst && (
        <button
          type="button"
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 sm:left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[index]}
        alt={`Photo ${index + 1} of ${urls.length}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] object-contain motion-safe:transition-opacity motion-safe:duration-150"
      />

      {!atLast && (
        <button
          type="button"
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-2 sm:right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div className="absolute bottom-6 left-0 right-0 flex justify-center text-white/90 text-sm">
        {index + 1} of {urls.length}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- --run src/__tests__/components/Lightbox.test.tsx`
Expected: 10 passing.

- [ ] **Step 5: Export from the barrel**

Create `src/components/parent/ui/index.ts`:

```ts
export { Lightbox } from "./Lightbox";
```

---

### Task 4.2: Wire gallery + lightbox into `TimelineWidget`

**Files:**
- Modify: `src/components/parent/TimelineWidget.tsx`

- [ ] **Step 1: Add gallery + lightbox state in `TimelineCard`**

Rewrite the card:

```tsx
function TimelineCard({ post }: { post: TimelinePost }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const TypeIcon = typeIcons[post.type] ?? MessageCircle;
  const badgeClass = typeBadge[post.type] ?? "bg-gray-50 text-gray-600";
  const dateStr = new Date(post.createdAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      <div className="flex items-start gap-3">
        {/* …existing icon + title block… */}
        <div className="flex-1 min-w-0">
          {/* …existing title/badge/content/tags… */}
          {post.mediaUrls?.length > 0 && (
            <TimelinePostMedia urls={post.mediaUrls} onOpen={setOpenIndex} />
          )}
          {/* …existing author+date line… */}
        </div>
      </div>
      <Lightbox urls={post.mediaUrls ?? []} openIndex={openIndex} onClose={() => setOpenIndex(null)} />
    </article>
  );
}
```

Add imports at top:
```tsx
import { useState } from "react";
import { TimelinePostMedia } from "./TimelinePostMedia";
import { Lightbox } from "./ui/Lightbox";
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run the broader test suite — expect PASS**

Run: `npm test -- --run`
Expected: all tests pass (upload-image, parent-posts, Lightbox, TimelinePostMedia, CreateParentPostForm).

- [ ] **Step 4: Commit Chunks 3+4**

```bash
git add src/components/parent/ui/Lightbox.tsx \
        src/components/parent/ui/index.ts \
        src/components/parent/TimelinePostMedia.tsx \
        src/components/parent/TimelineWidget.tsx \
        src/__tests__/components/Lightbox.test.tsx \
        src/__tests__/components/TimelinePostMedia.test.tsx
git commit -m "$(cat <<'EOF'
feat(parent): photo gallery + Lightbox in Timeline

- TimelinePostMedia renders mediaUrls as 1/2/3/4+ responsive layouts
- Lightbox primitive: keyboard nav, swipe-next/prev, swipe-down to close,
  prefers-reduced-motion, counter, clamp (no wraparound)
- Exported from src/components/parent/ui/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 5: Verification & PR

- [ ] **Step 1: Full test suite**

Run: `npm test -- --run`
Expected: all green including new tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors (warnings ok).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: successful build.

**Note:** `npm run build` runs `prisma migrate deploy` against the DATABASE_URL. If DB is unreachable, run `npx next build` directly to skip the migrate step.

- [ ] **Step 5: Manual test — educator flow**

Start dev server. As an admin, open a service, create a ParentPost, upload 3 photos, submit. Verify the post is created (check `/queue` or the posts API).

- [ ] **Step 6: Manual test — parent flow**

```
npx tsx scripts/create-test-parent.ts
```
Log in to `/parent` with the emitted magic-link URL. Verify the timeline shows the new post with the gallery, and that tapping a photo opens the Lightbox with working swipe / arrow / Escape.

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin feature/parent-post-photos
gh pr create --title "feat(parent): educator photo uploads in Timeline" --body "$(cat <<'EOF'
## Summary
- Harden `/api/upload/image` — EXIF strip via sharp, 5 MB cap, JPEG/PNG/WebP/HEIC only
- `CreateParentPostForm`: multi-image upload, up to 6 per post, client-side + server-side caps
- `TimelineWidget`: 1/2/3/4+ responsive gallery with `+N` overlay
- New `Lightbox` primitive at `src/components/parent/ui/Lightbox.tsx` — keyboard, swipe, counter, reduced-motion
- Parent-post schema: `mediaUrls.max(6)` (was 10)
- `next.config.ts`: `remotePatterns` for Vercel Blob

## Notes
- Vercel Blob Hobby plans cap direct uploads at 4.5 MB. Amana runs on Pro so 5 MB is the effective ceiling.
- Parent visibility still enforced at `src/app/api/parent/timeline/route.ts` — no bypass.

## Test plan
- [ ] `npm test -- --run` — all green, incl. new unit/integration tests
- [ ] `npm run build` — clean
- [ ] Manual: upload 3 photos as staff, view as parent, tap/swipe through Lightbox
- [ ] Manual: upload a 6 MB file → rejected client-side
- [ ] Manual: upload a HEIC from iPhone → transcoded to JPEG and viewable

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Risks & open questions

- **sharp native binaries** — `sharp` bundles platform-specific binaries. On Vercel, `sharp` is pre-installed in the build environment. Expect the first deploy to have a larger cold start.
- **HEIC decode** — sharp requires libheif to decode HEIC. Vercel's build environment includes this; local macOS also. If HEIC decode fails in some environment, the route returns 400 "Could not decode image" which is acceptable.
- **Magic-byte check skipped for HEIC** — the existing `validateFileContent` table doesn't know HEIC; we rely on sharp's decoder to surface invalid content. Acceptable because sharp will error on junk HEIC input.
