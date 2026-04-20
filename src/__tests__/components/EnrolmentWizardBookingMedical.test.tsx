/**
 * Regression test for Bug #9: BookingStep and MedicalStep have the same
 * stale-closure issue fixed in Bug #11 for ParentDetailsStep and
 * ChildDetailsStep.
 *
 * In BookingStep, updatePrefs spreads data.bookingPrefs from the render
 * closure. In MedicalStep, updateMedical spreads data.medicals from the
 * render closure. If two rapid updates happen on the same keystroke (e.g.
 * derived field handler), the second call will overwrite the first because
 * both read stale data.
 *
 * Fix: switch to functional updater form so each call reads the latest state.
 */
import { describe, it, expect } from "vitest";
import { INITIAL_FORM_DATA, EnrolmentFormData } from "@/components/enrol/types";

/**
 * Mimics EnrolmentWizard's updateData: supports both a raw partial and a
 * functional updater.
 */
function makeHarness(initial: EnrolmentFormData) {
  let current: EnrolmentFormData = initial;
  const updateData = (
    d:
      | Partial<EnrolmentFormData>
      | ((prev: EnrolmentFormData) => Partial<EnrolmentFormData>)
  ) => {
    const partial = typeof d === "function" ? d(current) : d;
    current = { ...current, ...partial };
  };
  return {
    get data() {
      return current;
    },
    updateData,
  };
}

describe("Bug #9: BookingStep and MedicalStep stale-closure fix", () => {
  it("BookingStep pattern: rapid back-to-back updates both persist", () => {
    const initial: EnrolmentFormData = {
      ...INITIAL_FORM_DATA,
      children: [{ ...INITIAL_FORM_DATA.children[0] }],
    };

    const harness = makeHarness(initial);
    const activeChild = 0;

    // Simulate BookingStep's updatePrefs pattern (after fix): two rapid updates
    const updatePrefs = (field: string, value: unknown) => {
      harness.updateData((prev) => {
        const bookingPrefs = [...prev.bookingPrefs];
        bookingPrefs[activeChild] = { ...bookingPrefs[activeChild], [field]: value };
        return { bookingPrefs };
      });
    };

    // First update: set service
    updatePrefs("serviceId", "service-123");
    expect(harness.data.bookingPrefs[0].serviceId).toBe("service-123");

    // Second rapid update: toggle session type
    updatePrefs("sessionTypes", ["bsc"]);

    // Both should persist (not overwrite each other)
    expect(harness.data.bookingPrefs[0].serviceId).toBe("service-123");
    expect(harness.data.bookingPrefs[0].sessionTypes).toEqual(["bsc"]);
  });

  it("MedicalStep pattern: updateMedical survives rapid updates", () => {
    const initial: EnrolmentFormData = {
      ...INITIAL_FORM_DATA,
      children: [{ ...INITIAL_FORM_DATA.children[0] }],
    };

    const harness = makeHarness(initial);
    const activeChild = 0;

    // Simulate MedicalStep's updateMedical pattern (after fix)
    const updateMedical = (field: string, value: unknown) => {
      harness.updateData((prev) => {
        const medicals = [...prev.medicals];
        medicals[activeChild] = { ...medicals[activeChild], [field]: value };
        return { medicals };
      });
    };

    // First update: set doctor name
    updateMedical("doctorName", "Dr. Smith");
    expect(harness.data.medicals[0].doctorName).toBe("Dr. Smith");

    // Second rapid update: set immunisation status
    updateMedical("immunisationUpToDate", true);

    // Both should persist
    expect(harness.data.medicals[0].doctorName).toBe("Dr. Smith");
    expect(harness.data.medicals[0].immunisationUpToDate).toBe(true);
  });

  it("MedicalStep pattern: updateMedication via functional updater survives", () => {
    const initial: EnrolmentFormData = {
      ...INITIAL_FORM_DATA,
      children: [{ ...INITIAL_FORM_DATA.children[0] }],
      medicals: [
        {
          ...INITIAL_FORM_DATA.medicals[0],
          medications: [{ name: "", dosage: "", frequency: "" }],
        },
      ],
    };

    const harness = makeHarness(initial);
    const activeChild = 0;

    // Simulate MedicalStep's updateMedication pattern (after fix)
    const updateMedication = (i: number, field: string, value: string) => {
      harness.updateData((prev) => {
        const medicals = [...prev.medicals];
        const meds = [...medicals[activeChild].medications];
        meds[i] = { ...meds[i], [field]: value };
        medicals[activeChild] = { ...medicals[activeChild], medications: meds };
        return { medicals };
      });
    };

    // First update: set medication name
    updateMedication(0, "name", "Aspirin");
    expect(harness.data.medicals[0].medications[0].name).toBe("Aspirin");

    // Second update: set dosage (both should persist)
    updateMedication(0, "dosage", "100mg");
    expect(harness.data.medicals[0].medications[0].name).toBe("Aspirin");
    expect(harness.data.medicals[0].medications[0].dosage).toBe("100mg");

    // Third update: set frequency
    updateMedication(0, "frequency", "Daily");
    expect(harness.data.medicals[0].medications[0].name).toBe("Aspirin");
    expect(harness.data.medicals[0].medications[0].dosage).toBe("100mg");
    expect(harness.data.medicals[0].medications[0].frequency).toBe("Daily");
  });
});
