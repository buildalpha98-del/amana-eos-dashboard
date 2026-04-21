"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

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
    setIsAuthenticated(!!active);
    setIsLoading(false);

    if (!active && pathname !== "/parent/login") {
      router.replace("/parent/login");
    }
  }, [pathname, router]);

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
