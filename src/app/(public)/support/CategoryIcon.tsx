import {
  BookOpen,
  CalendarDays,
  CreditCard,
  FileText,
  HeartHandshake,
  HelpCircle,
  ShieldCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Renders a HelpCategory.icon key as a lucide icon. Keys outside this map
 * fall back to BookOpen so a typo in the admin editor never breaks the page.
 */
const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  "calendar-days": CalendarDays,
  "credit-card": CreditCard,
  "file-text": FileText,
  "heart-handshake": HeartHandshake,
  "help-circle": HelpCircle,
  "shield-check": ShieldCheck,
  sun: Sun,
  users: Users,
};

export const CATEGORY_ICON_KEYS = Object.keys(ICONS);

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? BookOpen;
  return <Icon className={className} aria-hidden />;
}
