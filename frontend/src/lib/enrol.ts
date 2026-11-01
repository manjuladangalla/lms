import type { InstituteSettings, Programme } from "./types";

/** Per-programme override wins, otherwise the institute-wide setting. */
export function effectiveEnrolMode(
  programme: Pick<Programme, "enrolment_mode"> | null | undefined,
  settings: InstituteSettings | null | undefined
): "self" | "contact" {
  if (programme?.enrolment_mode === "contact") return "contact";
  if (programme?.enrolment_mode === "self") return "self";
  return settings?.enrolment_mode === "contact" ? "contact" : "self";
}

export function digitsOnly(v?: string | null): string {
  return (v || "").replace(/[^\d]/g, "");
}

/** wa.me deep link with the programme name baked into the pre-filled message. */
export function whatsappEnrolLink(settings: InstituteSettings | null | undefined, programmeTitle: string): string {
  const base =
    settings?.whatsapp_message?.trim() ||
    "Hello, I'd like to know more about your programmes.";
  const msg = encodeURIComponent(`${base}\n\nProgramme: ${programmeTitle}`);
  return `https://wa.me/${digitsOnly(settings?.whatsapp_number)}?text=${msg}`;
}

export function contactEnrolLink(programmeTitle: string): string {
  return `/contact?subject=${encodeURIComponent(`Enrolment enquiry — ${programmeTitle}`)}`;
}
