"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPublicParentRoute } from "@/lib/parent-routes";
import { useParentInstallEffects } from "@/hooks/useParentInstallEffects";

interface ParentAuthContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

const ParentAuthCtx = createContext<ParentAuthContext>({
  isAuthenticated: false,
  isLoading: true,
  logout: () => {},
});

export function useParentAuth() {
  return useContext(ParentAuthCtx);
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function ParentAuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check the non-httpOnly flag cookie (the actual JWT is httpOnly and
    // inaccessible to JS — this companion cookie just signals "logged in")
    const active = getCookie("parent-active");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe hydration read: document.cookie can't be read during render and must be re-checked on every navigation
    setIsAuthenticated(!!active);
    setIsLoading(false);

    // Must exempt every public route, not just /parent/login — a parent
    // confirming their email or signing up has no session yet by
    // definition, and redirecting them here made those pages unreachable.
    if (!active && !isPublicParentRoute(pathname)) {
      router.replace("/parent/login");
    }
  }, [pathname, router]);

  useParentInstallEffects(isAuthenticated);

  const logout = async () => {
    // Call the logout API to clear the httpOnly `parent-session` JWT cookie
    // server-side. Without this the JWT remains valid until it expires (7d)
    // and could be replayed against the APIs.
    try {
      await fetch("/api/parent/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore network errors — still clear client state and redirect below.
    }
    // Also clear the non-httpOnly flag cookie locally so the UI updates
    // immediately even if the response is slow.
    document.cookie =
      "parent-active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setIsAuthenticated(false);
    router.replace("/parent/login");
  };

  return (
    <ParentAuthCtx.Provider value={{ isAuthenticated, isLoading, logout }}>
      {children}
    </ParentAuthCtx.Provider>
  );
}
