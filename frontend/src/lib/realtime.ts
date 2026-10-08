import { useEffect, useRef } from "react";
import { API_BASE, tokenStore } from "./api";

type Handler = (event: string, payload: Record<string, unknown>) => void;

function wsUrl(): string {
  const base = API_BASE.replace(/\/api\/v1\/?$/, "");
  const origin = /^https?:\/\//.test(base)
    ? base.replace(/^http/, "ws")
    : `${window.location.protocol === "https:" ? "wss" : "ws"}://${
        window.location.host
      }${base}`;
  const token = tokenStore.access;
  return `${origin}/api/v1/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/** Subscribe to server realtime events (Redis → WebSocket). Auto-reconnects. */
export function useRealtime(handler: Handler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 1000;
    let pingTimer: number | undefined;

    const schedule = () => {
      window.setTimeout(() => {
        if (!closed) connect();
      }, retry);
      retry = Math.min(retry * 2, 15000);
    };

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        retry = 1000;
        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.event && msg.event !== "pong") {
            handlerRef.current(msg.event, msg.payload || {});
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (pingTimer) window.clearInterval(pingTimer);
        if (!closed) schedule();
      };
    };

    connect();
    return () => {
      closed = true;
      if (pingTimer) window.clearInterval(pingTimer);
      ws?.close();
    };
  }, [enabled]);
}
