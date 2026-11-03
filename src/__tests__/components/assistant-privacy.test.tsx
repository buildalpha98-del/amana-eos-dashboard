// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import AssistantPage from "@/app/(dashboard)/assistant/page";
import { FloatingChatWidget } from "@/components/assistant/FloatingChatWidget";
import { useAssistant } from "@/hooks/useAssistant";
const role = vi.hoisted(() => ({ value: "staff" }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: role.value } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/assistant" }));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));
describe("AI privacy experience", () => {
  beforeEach(() => { role.value = "staff"; });
  it.each(["staff", "member", "head_office"])("offers working help without collecting questions for %s", roleName => {
    role.value = roleName;
    render(<AssistantPage />);
    expect(screen.getByRole("heading", { name: "AI assistance is paused" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: /Policies & procedures/ })).toHaveAttribute("href", "/policies");
    expect(screen.getByRole("link", { name: roleName === "staff" ? /Staff handbook/ : /Help & how-to/ })).toHaveAttribute("href", roleName === "staff" ? "/tools/handbook" : "/handbook?tab=help");
  });
  it("does not show the floating chat launcher", () => {
    const { container } = render(<FloatingChatWidget />);
    expect(container).toBeEmptyDOMElement();
  });
  it("blocks a stale composer before creating messages or making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.sendMessage("Synthetic private question"); });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
    fetchSpy.mockRestore();
  });
});
