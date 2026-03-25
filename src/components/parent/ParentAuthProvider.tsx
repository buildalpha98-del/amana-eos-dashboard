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
    const token = getCookie("parent-session");
    setIsAuthenticated(!!token);
    setIsLoading(false);

    if (!token && pathname !== "/parent/login") {
      router.replace("/parent/login");
    }
  }, [pathname, router]);

  const logout = () => {
    // Clear cookie
    document.cookie =
      "parent-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setIsAuthenticated(false);
    router.replace("/parent/login");
  };

  return (
    <ParentAuthCtx.Provider value={{ isAuthenticated, isLoading, logout }}>
      {children}
    </ParentAuthCtx.Provider>
  );
}
