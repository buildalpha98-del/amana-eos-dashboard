// @vitest-environment jsdom
/**
 * Regression test for Bug #11: Parent reports that typing "2144" in the
 * postcode field on the enrol form only keeps "214" — the 4th digit is
 * swallowed.
 *
 * Root cause: the postcode handler fires two synchronous calls on the 4th
 * keystroke:
 *   1) updatePrimary("postcode", "2144")
 *   2) updatePrimary("state", "NSW")   // auto-derived from postcode
 *
 * Before the fix, updatePrimary read `data.primaryParent` from the render
 * closure, so both calls spread the SAME stale object. Call (2) shipped a
 * `primaryParent` that still had postcode="214", overwriting call (1).
 *
 * Fix: switch updatePrimary / updateSecondary / updateChild to the functional
 * updater form so each call sees the latest state.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ParentDetailsStep } from "@/components/enrol/steps/ParentDetailsStep";
import { ChildDetailsStep } from "@/components/enrol/steps/ChildDetailsStep";
import { INITIAL_FORM_DATA, EnrolmentFormData } from "@/components/enrol/types";

/**
 * Mimics EnrolmentWizard's updateData: supports both a raw partial and a
 * functional updater.
 */
function makeHarness(initial: EnrolmentFormData) {
  let current: EnrolmentFormData = initial;
  const subscribers = new Set<() => void>();
  const updateData = (
    d:
      | Partial<EnrolmentFormData>
      | ((prev: EnrolmentFormData) => Partial<EnrolmentFormData>)
  ) => {
    const partial = typeof d === "function" ? d(current) : d;
    current = { ...current, ...partial };
    subscribers.forEach((cb) => cb());
  };
  return {
    get data() {
      return current;
    },
    updateData,
    subscribe(cb: () => void) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}

function Wrapper({
  initial,
  children,
}: {
  initial: EnrolmentFormData;
  children: (props: {
    data: EnrolmentFormData;
    updateData: (
      d:
        | Partial<EnrolmentFormData>
        | ((prev: EnrolmentFormData) => Partial<EnrolmentFormData>)
    ) => void;
  }) => React.ReactNode;
}) {
  const harness = React.useMemo(() => makeHarness(initial), [initial]);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => harness.subscribe(force), [harness]);
  return (
    <>
      {children({ data: harness.data, updateData: harness.updateData })}
    </>
  );
}

describe("Bug #11: postcode preserves all four digits", () => {
  it("ParentDetailsStep keeps the full 4-digit postcode after auto-deriving state", () => {
    const initial: EnrolmentFormData = {
      ...INITIAL_FORM_DATA,
      children: [{ ...INITIAL_FORM_DATA.children[0] }],
    };

    let latest: EnrolmentFormData = initial;
    const onDataChange = vi.fn((d: EnrolmentFormData) => {
      latest = d;
    });

    function Harnessed() {
      return (
        <Wrapper initial={initial}>
          {({ data, updateData }) => {
            onDataChange(data);
            return (
              <ParentDetailsStep data={data} updateData={updateData} />
            );
          }}
        </Wrapper>
      );
    }

    render(<Harnessed />);

    // Grab the primary-parent postcode input. There are two (primary +
    // secondary) — we want the first one.
    const postcodeInputs = screen.getAllByDisplayValue("") as HTMLInputElement[];
    const postcodeInput = postcodeInputs.find(
      (el) =>
        el.getAttribute("inputmode") === "numeric" &&
        el.getAttribute("pattern") === "[0-9]*"
    );
    expect(postcodeInput).toBeTruthy();

    // Simulate typing the full value at once — matches how a mobile IME or
    // paste would deliver characters. The handler's internal slice/regex
    // keeps the first 4 digits and fires both postcode+state updates.
    fireEvent.change(postcodeInput!, { target: { value: "2144" } });

    // Both fields must persist: the 4th digit must NOT be swallowed.
    expect(latest.primaryParent.postcode).toBe("2144");
    expect(latest.primaryParent.state).toBe("NSW");
  });

  it("ChildDetailsStep keeps the full 4-digit postcode after auto-deriving state", () => {
    const initial: EnrolmentFormData = {
      ...INITIAL_FORM_DATA,
      children: [{ ...INITIAL_FORM_DATA.children[0] }],
    };

    let latest: EnrolmentFormData = initial;
    const onDataChange = vi.fn((d: EnrolmentFormData) => {
      latest = d;
    });

    function Harnessed() {
      return (
        <Wrapper initial={initial}>
          {({ data, updateData }) => {
            onDataChange(data);
            return (
              <ChildDetailsStep
                data={data}
                updateData={updateData}
                onAddChild={() => {}}
                onRemoveChild={() => {}}
              />
            );
          }}
        </Wrapper>
      );
    }

    render(<Harnessed />);

    const postcodeInputs = screen.getAllByDisplayValue("") as HTMLInputElement[];
    const postcodeInput = postcodeInputs.find(
      (el) =>
        el.getAttribute("inputmode") === "numeric" &&
        el.getAttribute("pattern") === "[0-9]*"
    );
    expect(postcodeInput).toBeTruthy();

    fireEvent.change(postcodeInput!, { target: { value: "2144" } });

    expect(latest.children[0].postcode).toBe("2144");
    expect(latest.children[0].state).toBe("NSW");
  });
});
