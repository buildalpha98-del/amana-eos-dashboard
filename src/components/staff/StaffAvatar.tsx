import { cn } from "@/lib/utils";

interface StaffAvatarProps {
  user: { id: string; name: string; avatar?: string | null };
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-24 w-24 text-xl",
} as const;

const SIZE_PX = { xs: 24, sm: 32, md: 48, lg: 96 } as const;

function hashToHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]?.[0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function StaffAvatar({ user, size = "md", className }: StaffAvatarProps) {
  const px = SIZE_PX[size];
  if (user.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar}
        alt={user.name}
        width={px}
        height={px}
        className={cn("rounded-full object-cover", SIZE_CLASSES[size], className)}
      />
    );
  }
  const hue = hashToHue(user.id);
  return (
    <div
      aria-label={user.name}
      className={cn(
        "rounded-full flex items-center justify-center font-medium text-white select-none",
        SIZE_CLASSES[size],
        className,
      )}
      style={{ backgroundColor: `hsl(${hue} 65% 45%)` }}
    >
      {initialsOf(user.name)}
    </div>
  );
}
