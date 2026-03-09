import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface BreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-gray-500 hover:text-brand transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-brand font-medium">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
