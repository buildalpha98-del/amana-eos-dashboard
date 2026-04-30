import { describe, it, expect } from "vitest";
import { destinationForSession } from "@/app/(auth)/login/page";

describe("destinationForSession", () => {
  it("honours an explicit non-default callbackUrl", () => {
    const session = {
      user: { role: "staff", serviceId: "svc-1" },
    };
    expect(destinationForSession(session, "/my-portal")).toBe("/my-portal");
  });

  it("falls back to /dashboard when callbackUrl is the generic default and role is org-wide", () => {
    expect(
      destinationForSession(
        { user: { role: "owner", serviceId: null } },
        "/dashboard",
      ),
    ).toBe("/dashboard");
    expect(
      destinationForSession(
        { user: { role: "head_office", serviceId: null } },
        "/dashboard",
      ),
    ).toBe("/dashboard");
    expect(
      destinationForSession(
        { user: { role: "admin", serviceId: null } },
        "/dashboard",
      ),
    ).toBe("/dashboard");
  });

  it("routes staff with a serviceId directly to /services/[id]?tab=today", () => {
    const session = {
      user: { role: "staff", serviceId: "svc-42" },
    };
    expect(destinationForSession(session, "/dashboard")).toBe(
      "/services/svc-42?tab=today",
    );
  });

  it("routes coordinator with serviceId to their service page", () => {
    const session = {
      user: { role: "coordinator", serviceId: "svc-c1" },
    };
    expect(destinationForSession(session, "/dashboard")).toBe(
      "/services/svc-c1?tab=today",
    );
  });

  it("routes member with serviceId to their service page", () => {
    const session = {
      user: { role: "member", serviceId: "svc-m9" },
    };
    expect(destinationForSession(session, "/dashboard")).toBe(
      "/services/svc-m9?tab=today",
    );
  });

  it("falls back to /dashboard for staff without a serviceId", () => {
    expect(
      destinationForSession(
        { user: { role: "staff", serviceId: null } },
        "/dashboard",
      ),
    ).toBe("/dashboard");
  });

  it("falls back to /dashboard when session is null", () => {
    expect(destinationForSession(null, "/dashboard")).toBe("/dashboard");
  });

  it("respects explicit callback even for service-scoped roles", () => {
    const session = {
      user: { role: "staff", serviceId: "svc-1" },
    };
    // Deep-link from /forgot-password redirect or a bookmarked URL
    expect(
      destinationForSession(session, "/todos?status=overdue"),
    ).toBe("/todos?status=overdue");
  });
});
