/**
 * Sanitizer configuration for the LMS course-player module renderer ONLY.
 *
 * Course modules are authored markdown that may embed images (uploaded to the
 * Vercel Blob store) and videos (YouTube / Loom / Vimeo). Supporting that means
 * widening rehype-sanitize to permit <img> and <iframe> — but ONLY from an
 * explicit host allow-list, enforced by a companion tree-walk (rehype-sanitize
 * cannot host-filter by itself).
 *
 * HARD CONSTRAINT: import these plugins from the course player only. Do NOT
 * apply this schema to ReportViewer / AiDraftReviewPanel / FloatingChatWidget —
 * those render less-trusted input and must keep the bare default schema.
 */
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { isTrustedBlobUrl } from "@/lib/trusted-urls";

/** Allowed iframe embed hosts (exact hostname match). */
const ALLOWED_VIDEO_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "www.loom.com",
  "loom.com",
  "player.vimeo.com",
  "vimeo.com",
]);

/** Is this a permitted media src for the given tag? */
export function isAllowedMediaSrc(tagName: string, src: unknown): boolean {
  if (typeof src !== "string" || src.length === 0) return false;
  if (tagName === "img") {
    // Images must come from our Blob store (wildcard subdomain suffix).
    return isTrustedBlobUrl(src);
  }
  if (tagName === "iframe") {
    try {
      const u = new URL(src);
      if (u.protocol !== "https:") return false;
      return ALLOWED_VIDEO_HOSTS.has(u.hostname);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Widened schema: adds <img> and <iframe> (host-agnostic here — the host
 * allow-list is enforced by the companion plugin below, which runs after this).
 */
export const lmsSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "img", "iframe"],
  attributes: {
    ...defaultSchema.attributes,
    img: [...((defaultSchema.attributes?.img as unknown[]) ?? []), "src", "alt", "title"],
    iframe: [
      "src",
      "width",
      "height",
      "title",
      "allow",
      "allowfullscreen",
      "allowFullScreen",
      "frameborder",
      "frameBorder",
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ["http", "https"],
  },
};

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Companion rehype plugin: strip any <img>/<iframe> whose src host is not on
 * the allow-list. Runs AFTER rehype-sanitize (which keeps the tags but can't
 * host-filter). Dependency-free recursive walk (no unist-util-visit).
 */
export function rehypeLmsMediaHostFilter() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.filter((child) => {
        if (
          child.type === "element" &&
          (child.tagName === "img" || child.tagName === "iframe")
        ) {
          return isAllowedMediaSrc(child.tagName, child.properties?.src);
        }
        return true;
      });
      node.children.forEach(walk);
    };
    walk(tree);
    return tree;
  };
}

/**
 * The plugin pair for react-markdown's `rehypePlugins` prop. Sanitize first
 * (keeps whitelisted tags + strips scripts/handlers), then host-filter media.
 */
export const LMS_MARKDOWN_REHYPE_PLUGINS = [
  [rehypeSanitize, lmsSanitizeSchema],
  rehypeLmsMediaHostFilter,
] as const;
