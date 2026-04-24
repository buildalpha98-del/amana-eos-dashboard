"use client";

/**
 * CommandMenu — ⌘K global palette.
 *
 * Fuzzy-matches nav items (from nav-config.ts) + actions (from command-actions.ts)
 * against the search query. Nav items route via router.push; actions run their
 * declared handler.
 *
 * Trigger: ⌘K / Ctrl+K anywhere in the staff dashboard layout.
 * Escape: closes.
 * ↑/↓: navigate results. Enter: pick.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, type NavItem } from "@/lib/nav-config";
import {
  getAvailableActions,
  filterActions,
  type CommandAction,
  type CommandActionContext,
} from "@/lib/command-actions";
import type { Role } from "@prisma/client";

export interface CommandMenuProps {
  /** Current user's role — used to gate predicate-based actions. */
  role?: Role;
  /** Current user's service scope if any. */
  serviceId?: string | null;
}

type Item =
  | { kind: "nav"; nav: NavItem }
  | { kind: "action"; action: CommandAction };

export function CommandMenu({ role, serviceId }: CommandMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const ctx: CommandActionContext = useMemo(
    () => ({ role, pathname: pathname ?? undefined, serviceId }),
    [role, pathname, serviceId],
  );

  // ── Open/close on ⌘K / Ctrl+K ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset query + focus on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Defer focus — the portal/overlay needs to mount first
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();

    // Nav items — filter by label + href substring
    const navMatches = q
      ? navItems.filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.href.toLowerCase().includes(q) ||
            (n.tooltip?.toLowerCase().includes(q) ?? false),
        )
      : navItems.slice(0, 8); // show first 8 by default

    // Actions — gated by predicate, then fuzzy-filtered
    const available = getAvailableActions(ctx);
    const actionMatches = filterActions(available, query);

    return [
      ...actionMatches.map<Item>((a) => ({ kind: "action", action: a })),
      ...navMatches.map<Item>((n) => ({ kind: "nav", nav: n })),
    ];
  }, [query, ctx]);

  // Clamp active index when results change
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  const runItem = useCallback(
    (item: Item) => {
      setOpen(false);
      if (item.kind === "nav") {
        router.push(item.nav.href);
      } else {
        item.action.handler(ctx, { push: (href) => router.push(href) });
      }
    },
    [ctx, router],
  );

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[activeIndex]) runItem(items[activeIndex]);
      }
    },
    [items, activeIndex, runItem],
  );

  if (!open) return null;

  // Group: actions first (grouped by section), then nav
  const actionItems = items.filter((i): i is Extract<Item, { kind: "action" }> => i.kind === "action");
  const navItems_ = items.filter((i): i is Extract<Item, { kind: "nav" }> => i.kind === "nav");
  const grouped = new Map<string, CommandAction[]>();
  actionItems.forEach(({ action }) => {
    const list = grouped.get(action.section) ?? [];
    list.push(action);
    grouped.set(action.section, list);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/40"
      onMouseDown={(e) => {
        // Click-outside closes; click inside the box doesn't propagate
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-[var(--radius-lg)] bg-[color:var(--color-cream-soft)] border border-[color:var(--color-border)] shadow-[var(--shadow-warm-lg)] overflow-hidden">
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--color-border)]">
          <Search className="w-5 h-5 text-[color:var(--color-muted)] shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Type a page or an action…"
            aria-label="Search commands"
            className="flex-1 bg-transparent text-[15px] text-[color:var(--color-foreground)] placeholder-[color:var(--color-muted)]/70 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-[color:var(--color-muted)] px-1.5 py-0.5 rounded bg-[color:var(--color-cream-deep)] border border-[color:var(--color-border)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          role="listbox"
          className="max-h-[55vh] overflow-y-auto py-1.5"
          data-testid="command-menu-list"
        >
          {items.length === 0 && (
            <li className="px-4 py-6 text-sm text-[color:var(--color-muted)] text-center">
              No commands match "{query}"
            </li>
          )}

          {/* Actions grouped by section */}
          {Array.from(grouped.entries()).map(([section, actions]) => (
            <GroupSection key={section} title={section}>
              {actions.map((action) => {
                const itemIdx = items.findIndex(
                  (i) => i.kind === "action" && i.action.id === action.id,
                );
                return (
                  <Row
                    key={action.id}
                    icon={action.icon}
                    label={action.label}
                    hint={action.hint}
                    active={itemIdx === activeIndex}
                    onMouseEnter={() => setActiveIndex(itemIdx)}
                    onClick={() => runItem(items[itemIdx])}
                  />
                );
              })}
            </GroupSection>
          ))}

          {/* Nav items group */}
          {navItems_.length > 0 && (
            <GroupSection title="Go to">
              {navItems_.map(({ nav }) => {
                const itemIdx = items.findIndex(
                  (i) => i.kind === "nav" && i.nav.href === nav.href,
                );
                return (
                  <Row
                    key={nav.href}
                    icon={nav.icon}
                    label={nav.label}
                    hint={nav.tooltip}
                    active={itemIdx === activeIndex}
                    onMouseEnter={() => setActiveIndex(itemIdx)}
                    onClick={() => runItem(items[itemIdx])}
                  />
                );
              })}
            </GroupSection>
          )}
        </ul>
      </div>
    </div>
  );
}

function GroupSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="px-1.5 pt-1.5 pb-0.5 first:pt-0.5">
      <div className="px-2 text-[10px] font-heading font-semibold uppercase tracking-[0.08em] text-[color:var(--color-muted)] mb-0.5">
        {title}
      </div>
      <ul>{children}</ul>
    </li>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  active,
  onMouseEnter,
  onClick,
}: {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] cursor-pointer text-sm",
        active
          ? "bg-[color:var(--color-brand-soft)] text-[color:var(--color-foreground)]"
          : "text-[color:var(--color-foreground)]/90 hover:bg-[color:var(--color-cream-deep)]",
      )}
    >
      {Icon && <Icon className="w-4 h-4 text-[color:var(--color-brand)] shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{label}</div>
        {hint && (
          <div className="text-[11px] text-[color:var(--color-muted)] truncate">
            {hint}
          </div>
        )}
      </div>
      {active && <ArrowRight className="w-4 h-4 text-[color:var(--color-muted)]" />}
    </li>
  );
}
