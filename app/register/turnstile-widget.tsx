"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileOptions = {
  sitekey: string;
  theme: "light";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: TurnstileOptions): string;
      reset(widgetId?: string): void;
      remove(widgetId: string): void;
    };
  }
}

export default function TurnstileWidget({
  siteKey,
  resetSignal,
  onToken,
}: {
  siteKey: string;
  resetSignal: number;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const initialized = useRef(false);
  const [widgetError, setWidgetError] = useState(false);

  const renderWidget = useCallback(() => {
    if (!container.current || !window.turnstile || widgetId.current) return;
    setWidgetError(false);
    try {
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: "light",
        callback: (token) => {
          setWidgetError(false);
          onToken(token);
        },
        "error-callback": () => {
          onToken("");
          setWidgetError(true);
        },
        "expired-callback": () => onToken(""),
        "timeout-callback": () => onToken(""),
      });
    } catch {
      onToken("");
      setWidgetError(true);
    }
  }, [onToken, siteKey]);

  useEffect(() => {
    if (initialized.current && widgetId.current) {
      window.turnstile?.reset(widgetId.current);
      onToken("");
    }
    initialized.current = true;
  }, [onToken, resetSignal]);

  useEffect(() => () => {
    if (widgetId.current) window.turnstile?.remove(widgetId.current);
  }, []);

  return <div>
    <Script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onReady={renderWidget}
      onError={() => {
        onToken("");
        setWidgetError(true);
      }}
    />
    <div ref={container} />
    {widgetError && <p className="loginSubtitle" role="alert">The security check could not load. Please refresh the page and try again.</p>}
  </div>;
}
