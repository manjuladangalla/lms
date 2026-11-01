import { useAuth } from "../store/auth";

/** Floating WhatsApp chat button — configured in Admin → Institute Settings. */
export default function WhatsAppFloat() {
  const { settings } = useAuth();
  const raw = (settings?.whatsapp_number || "").replace(/[^\d]/g, "");
  if (!raw) return null;

  const msg = encodeURIComponent(settings?.whatsapp_message || "Hello, I'd like to know more about your programmes.");
  const href = `https://wa.me/${raw}?text=${msg}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className="group fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-110 hover:shadow-xl"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-30" />
      <svg viewBox="0 0 32 32" className="relative h-7 w-7 fill-current" aria-hidden="true">
        <path d="M16.04 3C9.4 3 4 8.4 4 15.03c0 2.34.68 4.53 1.87 6.39L4 29l7.75-1.82a11.9 11.9 0 0 0 4.29.83c6.63 0 12.03-5.4 12.03-12.03C28.07 8.4 22.67 3 16.04 3zm0 21.9c-1.42 0-2.81-.38-4.03-1.1l-.29-.17-4.6 1.08 1.09-4.48-.19-.3a9.86 9.86 0 0 1-1.5-5.24c0-5.47 4.45-9.92 9.93-9.92 5.47 0 9.92 4.45 9.92 9.92s-4.45 9.21-9.33 9.21zm5.45-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" />
      </svg>
    </a>
  );
}
