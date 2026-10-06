/**
 * Matching parent questions to Help Centre answers.
 *
 * ONE ranking, used on both sides of a parent message: the parent sees the
 * likely answers while they type (and often never needs to send), and staff
 * see the same answers as one-click replies. Help Centre articles are the
 * single source — edited at /help-centre, never hard-coded here.
 *
 * Keyword overlap rather than phrase matching: the public search matches the
 * WHOLE query as a substring, so "how do I book a casual day" found nothing
 * while an article titled "How do I book a casual day?" sat right there.
 * Pure, so the ranking is testable without a database.
 */

export interface SuggestableArticle {
  id: string;
  title: string;
  slug: string;
  body: string;
  published?: boolean;
}

const STOPWORDS = new Set(
  (
    "a an and are as at be but by can could do does for from get got has have how " +
    "hi hello i if in into is it its me my of on or our please so that the their " +
    "them there they this to us was we what when where which who why will with " +
    "would you your im ive dont cant thanks thank regards salam assalamu alaikum " +
    // In nearly every parent question, so they carry no signal on their own.
    "child children kid kids son daughter amana oshc"
  ).split(" "),
);

/** Lower-cased content words, crudely singularised ("bookings" → "booking"). */
export function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  return [...new Set(words)];
}

/** Title matches count triple — a title is the question a parent asks. */
export function scoreArticle(article: SuggestableArticle, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = ` ${keywords(article.title).join(" ")} `;
  const body = ` ${keywords(article.body).join(" ")} `;
  let score = 0;
  for (const t of terms) {
    if (title.includes(` ${t}`)) score += 3;
    else if (body.includes(` ${t}`)) score += 1;
  }
  return score;
}

/**
 * Best matches first. `minScore` keeps one incidental word ("child", which
 * is in every article) from dressing up an irrelevant answer as a match.
 */
export function suggestArticles<T extends SuggestableArticle>(
  articles: T[],
  query: string,
  { limit = 3, minScore = 2 }: { limit?: number; minScore?: number } = {},
): T[] {
  const terms = keywords(query);
  return articles
    .map((a) => ({ a, score: scoreArticle(a, terms) }))
    .filter((r) => r.score >= minScore)
    .sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title))
    .slice(0, limit)
    .map((r) => r.a);
}

/**
 * Markdown → plain text for a chat reply: messages render as plain text, so
 * `**bold**` and `[link](url)` would arrive as literal punctuation.
 */
export function markdownToPlain(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A short plain-text preview for a suggestion card. */
export function excerpt(md: string, max = 160): string {
  const plain = markdownToPlain(md).replace(/\s+/g, " ");
  return plain.length <= max ? plain : `${plain.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
