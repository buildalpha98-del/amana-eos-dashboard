"use client";

/**
 * The service's own left-hand navigation.
 *
 * Replaces the top tab bar on desktop. The tab bar hid every sub-page
 * behind a group you had to guess first: nine of the ten things a
 * coordinator opens in a day were invisible until you clicked the right
 * one of eight tabs. A tree shows the whole service at once, which is
 * the single thing OWNA's layout gets right.
 *
 * Two things carry the weight visually:
 *
 *  - Groups are separated as BLOCKS, not a flat indented list. Each has
 *    its own surface, its own header row, and space between it and the
 *    next one, because a tree of forty items with uniform spacing is
 *    just as hard to scan as eight hidden tabs.
 *  - Favourites pin to the top. A coordinator opens the same four pages
 *    every day and they live in four different groups.
 *
 * Favourites are stored per-user in localStorage and shared across every
 * service — the four pages you live in are the same at every centre.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface TabGroup {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subTabs: SubTab[];
}

const FAVOURITES_KEY = "amana.service-nav.favourites";

/** "daily::roll-call" — group and sub together, since sub keys repeat. */
const favKey = (group: string, sub: string) => `${group}::${sub}`;

/**
 * localStorage as an external store.
 *
 * Reading it in useState would mismatch hydration (the server has no
 * localStorage, so the first client render would disagree with the
 * server's empty one), and reading it in an effect means a visible flash
 * of "no favourites". useSyncExternalStore is what React provides for
 * exactly this: the server snapshot is empty, the client's is real, and
 * React reconciles it without either problem.
 */
const EMPTY_SNAPSHOT = "[]";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing favourites should update this one.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Returns the raw JSON string, which is stable enough to compare by ===. */
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(FAVOURITES_KEY) ?? EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

const getServerSnapshot = () => EMPTY_SNAPSHOT;

function writeFavourites(next: Set<string>) {
  try {
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next]));
  } catch {
    // Not being able to persist shouldn't block the click.
  }
  listeners.forEach((l) => l());
}

export function ServiceNavTree({
  groups,
  activeGroup,
  activeSub,
  onGroupChange,
  onSubChange,
  badgeFor,
  className,
}: {
  groups: TabGroup[];
  activeGroup: string;
  activeSub?: string;
  onGroupChange: (key: string) => void;
  onSubChange: (key: string) => void;
  badgeFor?: (groupKey: string) => number | undefined;
  /** Lets the mobile sheet drop the fixed width and the divider. */
  className?: string;
}) {
  // Collapsed state is per-group and starts empty — everything open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const favourites = useMemo(() => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set<string>();
    } catch {
      // A corrupt value shouldn't cost anyone their navigation.
      return new Set<string>();
    }
  }, [raw]);

  const toggleFavourite = useCallback(
    (key: string) => {
      const next = new Set(favourites);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeFavourites(next);
    },
    [favourites],
  );

  const go = useCallback(
    (groupKey: string, subKey?: string) => {
      onGroupChange(groupKey);
      if (subKey) onSubChange(subKey);
    },
    [onGroupChange, onSubChange],
  );

  // Resolve favourites against what this role can actually see, so a
  // pinned page that a coordinator loses access to just disappears
  // rather than rendering a dead row.
  const favouriteRows = groups.flatMap((g) =>
    g.subTabs
      .filter((s) => favourites.has(favKey(g.key, s.key)))
      .map((s) => ({ group: g, sub: s })),
  );

  return (
    <nav
      aria-label="Service sections"
      className={cn("w-60 shrink-0 space-y-3 pr-1", className)}
    >
      {favouriteRows.length > 0 && (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-2">
          <p className="px-1.5 pb-1 text-2xs font-semibold uppercase tracking-widest text-brand">
            Favourites
          </p>
          <ul className="space-y-0.5">
            {favouriteRows.map(({ group, sub }) => {
              const isActive =
                activeGroup === group.key && activeSub === sub.key;
              return (
                <li key={favKey(group.key, sub.key)} className="group/fav flex items-center">
                  <button
                    type="button"
                    onClick={() => go(group.key, sub.key)}
                    className={cn(
                      "flex min-h-8 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors",
                      isActive
                        ? "bg-brand/15 font-semibold text-brand"
                        : "text-foreground hover:bg-brand/10",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <sub.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{sub.label}</span>
                    {/* Which group it came from — "Posts" and "Children"
                        both exist in more than one place. */}
                    <span className="shrink-0 text-2xs text-muted">
                      {group.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavourite(favKey(group.key, sub.key))}
                    aria-label={`Unpin ${sub.label}`}
                    className="rounded p-1 text-brand hover:bg-brand/10"
                  >
                    <Star className="h-3 w-3 fill-current" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {groups.map((group) => {
        const isActive = activeGroup === group.key;
        const hasSubs = group.subTabs.length > 0;
        // Every group collapses, including the one you're in — a long
        // group you've finished with is exactly the one you want out of
        // the way, and the content stays on screen regardless.
        const isOpen = !collapsed[group.key];
        const badge = badgeFor?.(group.key);

        return (
          <div
            key={group.key}
            className={cn(
              "overflow-hidden rounded-xl border transition-colors",
              isActive
                ? "border-brand/30 bg-brand/5"
                : "border-border bg-card",
            )}
          >
            {/* Header row — the whole thing is the group button, with a
                separate chevron so opening a group and navigating to it
                aren't the same click. */}
            <div
              className={cn(
                "flex items-center gap-1 px-1.5 py-1.5",
                isOpen && hasSubs && "border-b border-border/60",
              )}
            >
              <button
                type="button"
                onClick={() => onGroupChange(group.key)}
                className={cn(
                  "flex min-h-9 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors",
                  isActive
                    ? "text-brand"
                    : "text-foreground hover:bg-surface",
                )}
                aria-current={isActive && !activeSub ? "page" : undefined}
              >
                <group.icon className="h-4 w-4 shrink-0" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-2xs font-semibold uppercase tracking-widest",
                  )}
                >
                  {group.label}
                </span>
                {badge != null && badge > 0 && (
                  <span className="rounded-full bg-brand px-1.5 py-0.5 text-2xs font-semibold text-white">
                    {badge}
                  </span>
                )}
              </button>
              {hasSubs && (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((p) => ({ ...p, [group.key]: !p[group.key] }))
                  }
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.label}`}
                  aria-expanded={isOpen}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      !isOpen && "-rotate-90",
                    )}
                  />
                </button>
              )}
            </div>

            {hasSubs && isOpen && (
              <ul className="space-y-0.5 p-1.5">
                {group.subTabs.map((sub) => {
                  const subActive = isActive && activeSub === sub.key;
                  const key = favKey(group.key, sub.key);
                  const pinned = favourites.has(key);
                  return (
                    <li key={sub.key} className="group/row flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          // Clicking a sub-page from another group has to
                          // move both, or you land on the wrong tab's
                          // content with the right label highlighted.
                          if (!isActive) onGroupChange(group.key);
                          onSubChange(sub.key);
                        }}
                        className={cn(
                          "flex min-h-8 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors",
                          subActive
                            ? "bg-brand/15 font-semibold text-brand"
                            : "text-muted hover:bg-surface hover:text-foreground",
                        )}
                        aria-current={subActive ? "page" : undefined}
                      >
                        <sub.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{sub.label}</span>
                      </button>
                      {/* Always rendered so it's reachable by keyboard;
                          only visible on hover, focus, or when pinned. */}
                      <button
                        type="button"
                        onClick={() => toggleFavourite(key)}
                        aria-label={
                          pinned
                            ? `Unpin ${sub.label} from favourites`
                            : `Pin ${sub.label} to favourites`
                        }
                        aria-pressed={pinned}
                        className={cn(
                          "rounded p-1 transition-opacity hover:bg-surface focus:opacity-100",
                          pinned
                            ? "text-brand opacity-100"
                            : "text-muted opacity-0 group-hover/row:opacity-100",
                        )}
                      >
                        <Star
                          className={cn("h-3 w-3", pinned && "fill-current")}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
