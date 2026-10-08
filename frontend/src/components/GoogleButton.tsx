import { useEffect, useRef } from "react";
import { useAuth } from "../store/auth";
import type { User } from "../lib/types";
import { Alert } from "./ui";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (el: HTMLElement, options: object) => void;
        };
      };
    };
  }
}

export function GoogleButton({ onSuccess }: { onSuccess: (user?: User) => void }) {
  const { settings, googleLogin } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const clientId = settings?.google_client_id;

  useEffect(() => {
    if (!clientId || !ref.current) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          const u = await googleLogin({ id_token: response.credential });
          onSuccess(u);
        },
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
      });
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [clientId, googleLogin, onSuccess]);

  if (!clientId) {
    return (
      <div className="mt-4">
        <Alert type="info">Google login is available when GOOGLE_CLIENT_ID is configured by the admin.</Alert>
      </div>
    );
  }
  return <div ref={ref} className="mt-5 flex justify-center" />;
}
