import { useEffect, useRef, useState } from "react";
import { Tag, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { PricingQuote } from "../lib/types";
import { Input } from "./ui";

type Props = {
  programmeId: string;
  scopeType?: "programme" | "subject" | "lesson";
  scopeId?: string | null;
  onQuote?: (q: { promo_code: string | null; amount: number; member_discount_percent: number } | null) => void;
};

/**
 * Live price quote: shows the logged-in member's discount and lets the buyer
 * apply a promo code (stacked on top of the membership discount).
 * Reports the applied code + final amount via onQuote.
 */
export function PromoQuote({ programmeId, scopeType = "programme", scopeId = null, onQuote }: Props) {
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;

  const fetchQuote = async (promo: string) => {
    if (!programmeId) return;
    setChecking(true);
    setError("");
    try {
      const q = await api.post<PricingQuote>("/pricing/preview", {
        programme_id: programmeId,
        scope_type: scopeType,
        scope_id: scopeId,
        promo_code: promo || null,
      });
      setQuote(q);
      if (q.promo_error) setError(q.promo_error);
      onQuoteRef.current?.({
        promo_code: q.promo_code,
        amount: q.amount,
        member_discount_percent: q.member_discount_percent,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not fetch price");
      if (promo) onQuoteRef.current?.(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setQuote(null);
    setCode("");
    setError("");
    fetchQuote("");
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmeId, scopeType, scopeId]);

  const onCodeChange = (v: string) => {
    const up = v.toUpperCase();
    setCode(up);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => fetchQuote(up.trim()), 450);
  };

  const clear = () => {
    setCode("");
    setError("");
    fetchQuote("");
  };

  if (!quote) return null;

  const showBreakdown =
    quote.member_discount_percent > 0 || quote.promo_discount_percent > 0 || quote.promo_error;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9 uppercase"
            placeholder="Promo code"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
        </div>
        {code && (
          <button className="btn-ghost px-3" onClick={clear} aria-label="Clear promo code">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}

      {showBreakdown && (
        <div className="space-y-1.5 rounded-xl border border-border bg-surface2/60 p-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>Base price</span>
            <span>{quote.currency} {quote.base_amount.toFixed(2)}</span>
          </div>
          {quote.member_discount_percent > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Membership −{quote.member_discount_percent}%</span>
              <span>
                −{quote.currency} {(quote.base_amount - round2(quote.base_amount * (100 - quote.member_discount_percent) / 100)).toFixed(2)}
              </span>
            </div>
          )}
          {quote.promo_discount_percent > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Promo {quote.promo_code} −{quote.promo_discount_percent}%</span>
              <span>
                −{quote.currency} {(round2(quote.base_amount * (100 - quote.member_discount_percent) / 100) - quote.amount).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1.5 font-bold">
            <span>You pay</span>
            <span className="text-primary">
              {checking ? "…" : `${quote.currency} ${quote.amount.toFixed(2)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default PromoQuote;
