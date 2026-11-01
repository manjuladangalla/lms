import { MessageCircle, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../store/auth";
import { whatsappEnrolLink, contactEnrolLink, digitsOnly } from "../lib/enrol";
import { Modal } from "./ui";

/**
 * "How would you like to enrol?" — shown when a programme (or the whole site)
 * is in contact-only mode. Offers WhatsApp (pre-filled message incl. programme
 * name) or the contact form.
 */
export default function EnrolContactModal({
  open,
  onClose,
  programmeTitle,
}: {
  open: boolean;
  onClose: () => void;
  programmeTitle: string;
}) {
  const { settings } = useAuth();
  const waNumber = digitsOnly(settings?.whatsapp_number);

  return (
    <Modal open={open} onClose={onClose} title={`Enrol in ${programmeTitle}`}>
      <p className="text-sm text-muted">
        Online enrolment for this programme is handled directly by the institute. Choose how you'd like to reach us —
        our team will confirm your seat.
      </p>

      <div className="mt-5 grid gap-3">
        {waNumber ? (
          <a
            href={whatsappEnrolLink(settings, programmeTitle)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center gap-4 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 p-4 transition hover:-translate-y-0.5 hover:bg-[#25D366]/15"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#25D366] text-white">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold">Chat on WhatsApp</span>
              <span className="block text-xs text-muted">
                Message pre-filled with this programme's name — tap to send
              </span>
            </span>
          </a>
        ) : null}

        <Link
          to={contactEnrolLink(programmeTitle)}
          onClick={onClose}
          className={`flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:bg-surface2 ${
            waNumber ? "" : "border-primary/40 bg-primary/5"
          }`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary2 text-white">
            <Mail className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-bold">Send an enquiry form</span>
            <span className="block text-xs text-muted">
              Fills the contact form with this programme — we reply by email
            </span>
          </span>
        </Link>
      </div>
    </Modal>
  );
}
