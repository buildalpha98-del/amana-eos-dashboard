export interface ChildDetails {
  firstName: string;
  surname: string;
  dob: string;
  gender: "female" | "male" | "";
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  culturalBackground: string[];
  schoolName: string;
  yearLevel: string;
  crn: string;
}

export interface ParentDetails {
  firstName: string;
  surname: string;
  dob: string;
  email: string;
  mobile: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  relationship: string;
  occupation: string;
  workplace: string;
  workPhone: string;
  crn: string;
  soleCustody: boolean | null;
}

export interface MedicalInfo {
  doctorName: string;
  doctorPractice: string;
  doctorPhone: string;
  medicareNumber: string;
  medicareRef: string;
  medicareExpiry: string;
  immunisationUpToDate: boolean | null;
  immunisationDetails: string;
  anaphylaxisRisk: boolean | null;
  allergies: boolean | null;
  allergyDetails: string;
  asthma: boolean | null;
  otherConditions: string;
  medications: MedicationEntry[];
  dietaryRequirements: boolean | null;
  dietaryDetails: string;
}

export interface MedicationEntry {
  name: string;
  dosage: string;
  frequency: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export interface AuthorisedPerson {
  name: string;
  relationship: string;
}

export interface Consents {
  firstAid: boolean | null;
  medication: boolean | null;
  ambulance: boolean | null;
  transport: boolean | null;
  excursions: boolean | null;
  photos: boolean | null;
  sunscreen: boolean | null;
}

export interface BookingPrefs {
  serviceId: string;
  sessionTypes: string[];
  days: Record<string, string[]>;
  bookingType: "permanent" | "casual" | "";
  startDate: string;
  requirements: string;
}

export interface PaymentInfo {
  method: "credit_card" | "bank_account" | "";
  cardName: string;
  cardNumber: string;
  cardExpiryMonth: string;
  cardExpiryYear: string;
  cardCcv: string;
  bankAccountName: string;
  bankBsb: string;
  bankAccountNumber: string;
}

export interface DocumentUpload {
  childIndex: number;
  type: "child_photo" | "birth_certificate" | "immunisation_record" | string;
  filename: string;
  url: string;
}

export interface EnrolmentFormData {
  children: ChildDetails[];
  primaryParent: ParentDetails;
  secondaryParent: ParentDetails;
  medicals: MedicalInfo[];
  emergencyContacts: EmergencyContact[];
  authorisedPickup: AuthorisedPerson[];
  consents: Consents;
  courtOrders: boolean;
  courtOrderFiles: { filename: string; url: string }[];
  medicalFiles: { childIndex: number; type: string; filename: string; url: string }[];
  documentUploads: DocumentUpload[];
  bookingPrefs: BookingPrefs[];
  payment: PaymentInfo;
  referralSource: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  debitAgreement: boolean;
  signature: string;
}

export const EMPTY_CHILD: ChildDetails = {
  firstName: "",
  surname: "",
  dob: "",
  gender: "",
  street: "",
  suburb: "",
  state: "",
  postcode: "",
  culturalBackground: [],
  schoolName: "",
  yearLevel: "",
  crn: "",
};

export const EMPTY_PARENT: ParentDetails = {
  firstName: "",
  surname: "",
  dob: "",
  email: "",
  mobile: "",
  street: "",
  suburb: "",
  state: "",
  postcode: "",
  relationship: "",
  occupation: "",
  workplace: "",
  workPhone: "",
  crn: "",
  soleCustody: null,
};

export const EMPTY_MEDICAL: MedicalInfo = {
  doctorName: "",
  doctorPractice: "",
  doctorPhone: "",
  medicareNumber: "",
  medicareRef: "",
  medicareExpiry: "",
  immunisationUpToDate: null,
  immunisationDetails: "",
  anaphylaxisRisk: null,
  allergies: null,
  allergyDetails: "",
  asthma: null,
  otherConditions: "",
  medications: [],
  dietaryRequirements: null,
  dietaryDetails: "",
};

export const EMPTY_BOOKING: BookingPrefs = {
  serviceId: "",
  sessionTypes: [],
  days: {},
  bookingType: "",
  startDate: "",
  requirements: "",
};

export const EMPTY_EMERGENCY: EmergencyContact = {
  name: "",
  relationship: "",
  phone: "",
  email: "",
};

export const INITIAL_FORM_DATA: EnrolmentFormData = {
  children: [{ ...EMPTY_CHILD }],
  primaryParent: { ...EMPTY_PARENT },
  secondaryParent: { ...EMPTY_PARENT },
  medicals: [{ ...EMPTY_MEDICAL }],
  emergencyContacts: [
    { ...EMPTY_EMERGENCY },
    { ...EMPTY_EMERGENCY },
    { ...EMPTY_EMERGENCY },
  ],
  authorisedPickup: [],
  consents: {
    firstAid: null,
    medication: null,
    ambulance: null,
    transport: null,
    excursions: null,
    photos: null,
    sunscreen: null,
  },
  courtOrders: false,
  courtOrderFiles: [],
  medicalFiles: [],
  documentUploads: [],
  bookingPrefs: [{ ...EMPTY_BOOKING }],
  payment: {
    method: "",
    cardName: "",
    cardNumber: "",
    cardExpiryMonth: "",
    cardExpiryYear: "",
    cardCcv: "",
    bankAccountName: "",
    bankBsb: "",
    bankAccountNumber: "",
  },
  referralSource: "",
  termsAccepted: false,
  privacyAccepted: false,
  debitAgreement: false,
  signature: "",
};

export const STEPS = [
  { key: "children", label: "Child Details", icon: "👶" },
  { key: "parents", label: "Parent / Guardian", icon: "👨‍👩‍👧" },
  { key: "medical", label: "Medical", icon: "🏥" },
  { key: "emergency", label: "Emergency Contacts", icon: "📞" },
  { key: "consents", label: "Consents", icon: "✅" },
  { key: "booking", label: "Booking", icon: "📅" },
  { key: "payment", label: "Payment", icon: "💳" },
  { key: "review", label: "Review & Submit", icon: "📋" },
] as const;

export const CULTURAL_OPTIONS = [
  "Aboriginal",
  "Torres Strait Islander",
  "Arabic",
  "Bangladeshi",
  "Chinese",
  "Fijian",
  "Filipino",
  "Indian",
  "Indonesian",
  "Lebanese",
  "Maori",
  "Pakistani",
  "Samoan",
  "Sri Lankan",
  "Turkish",
  "Vietnamese",
  "Other",
];

export const AUSTRALIAN_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

export const DOCUMENT_TYPES = [
  { value: "child_photo", label: "Photo of Child" },
  { value: "birth_certificate", label: "Birth Certificate" },
  { value: "immunisation_record", label: "Immunisation Record" },
] as const;

/** Returns error messages for a step, or empty array if valid */
export function validateStep(step: number, data: EnrolmentFormData): string[] {
  const errors: string[] = [];

  switch (step) {
    case 0: // Child Details
      data.children.forEach((child, i) => {
        const label = data.children.length > 1 ? ` (Child ${i + 1})` : "";
        if (!child.firstName.trim()) errors.push(`First name is required${label}`);
        if (!child.surname.trim()) errors.push(`Surname is required${label}`);
        if (!child.dob) errors.push(`Date of birth is required${label}`);
      });
      break;

    case 1: // Parent / Guardian
      if (!data.primaryParent.firstName.trim()) errors.push("Primary parent first name is required");
      if (!data.primaryParent.surname.trim()) errors.push("Primary parent surname is required");
      if (!data.primaryParent.email.trim()) errors.push("Primary parent email is required");
      if (!data.primaryParent.mobile.trim()) errors.push("Primary parent mobile is required");
      if (!data.primaryParent.relationship.trim()) errors.push("Relationship to child is required");
      if (!data.primaryParent.dob) errors.push("Primary parent date of birth is required");
      if (!data.primaryParent.crn.trim()) errors.push("Primary parent CRN is required");
      if (!data.primaryParent.street.trim()) errors.push("Primary parent address is required");
      if (!data.primaryParent.suburb.trim()) errors.push("Primary parent suburb is required");
      if (!data.primaryParent.state) errors.push("Primary parent state is required");
      if (!data.primaryParent.postcode.trim()) errors.push("Primary parent postcode is required");
      // If secondary parent has any field filled, require key fields
      const sp = data.secondaryParent;
      const hasSecondary = sp.firstName || sp.surname || sp.email || sp.mobile;
      if (hasSecondary) {
        if (!sp.firstName.trim()) errors.push("Secondary parent first name is required");
        if (!sp.surname.trim()) errors.push("Secondary parent surname is required");
        if (!sp.mobile.trim()) errors.push("Secondary parent mobile is required");
      }
      break;

    case 2: // Medical
      data.medicals.forEach((med, i) => {
        const label = data.children.length > 1 ? ` (${data.children[i]?.firstName || `Child ${i + 1}`})` : "";
        if (!med.doctorName.trim()) errors.push(`Doctor's name is required${label}`);
        if (!med.doctorPhone.trim()) errors.push(`Doctor's phone is required${label}`);
        if (med.immunisationUpToDate === null) errors.push(`Immunisation status is required${label}`);
        if (med.anaphylaxisRisk === null) errors.push(`Anaphylaxis risk is required${label}`);
        if (med.allergies === null) errors.push(`Allergies status is required${label}`);
      });
      break;

    case 3: // Emergency Contacts
      {
        const first = data.emergencyContacts[0];
        if (!first?.name.trim()) errors.push("Emergency contact 1 name is required");
        if (!first?.relationship.trim()) errors.push("Emergency contact 1 relationship is required");
        if (!first?.phone.trim()) errors.push("Emergency contact 1 phone is required");
      }
      break;

    case 4: // Consents
      if (data.consents.firstAid !== true) errors.push("First aid consent is required");
      if (data.consents.ambulance !== true) errors.push("Ambulance consent is required");
      if (data.consents.transport !== true) errors.push("Transportation consent is required");
      if (data.consents.sunscreen !== true) errors.push("Sunscreen consent is required");
      break;

    case 5: // Booking
      data.bookingPrefs.forEach((bp, i) => {
        const label = data.children.length > 1 ? ` (${data.children[i]?.firstName || `Child ${i + 1}`})` : "";
        if (!bp.serviceId) errors.push(`Centre/service is required${label}`);
        if (!bp.sessionTypes.length) errors.push(`At least one session type is required${label}`);
        if (!bp.bookingType) errors.push(`Booking type is required${label}`);
      });
      break;

    case 6: // Payment
      if (!data.payment.method) errors.push("Payment method is required");
      if (data.payment.method === "credit_card") {
        if (!data.payment.cardName.trim()) errors.push("Name on card is required");
        if (!data.payment.cardNumber.trim() || data.payment.cardNumber.length < 13) errors.push("Valid card number is required");
        if (!data.payment.cardExpiryMonth) errors.push("Card expiry month is required");
        if (!data.payment.cardExpiryYear) errors.push("Card expiry year is required");
        if (!data.payment.cardCcv.trim()) errors.push("CCV is required");
      }
      if (data.payment.method === "bank_account") {
        if (!data.payment.bankAccountName.trim()) errors.push("Account name is required");
        if (!data.payment.bankBsb.trim() || data.payment.bankBsb.length < 6) errors.push("Valid BSB is required (6 digits)");
        if (!data.payment.bankAccountNumber.trim()) errors.push("Account number is required");
      }
      if (!data.debitAgreement) errors.push("Direct debit service agreement must be accepted");
      break;

    case 7: // Review
      if (!data.termsAccepted) errors.push("Terms & Conditions must be accepted");
      if (!data.privacyAccepted) errors.push("Privacy Policy must be accepted");
      if (!data.signature) errors.push("Digital signature is required");
      break;
  }

  return errors;
}
