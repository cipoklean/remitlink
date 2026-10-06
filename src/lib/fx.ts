"use client";

// Live USD → NGN rate with a static fallback (AGENT.md 7b B3, owner item 3).
//
// open.er-api.com is a free, CORS-open source (verified `access-control-allow-origin: *`),
// so this runs entirely client-side - no server proxy. The fetch is module-cached so
// every screen that shows the figure makes at most ONE request per page session.
//
// Honesty (AGENT.md rule 4): when the live rate is loaded we say "LIVE RATE"; when we
// fall back to the static figure we say "SAMPLE RATE" (never claim live we don't have).
// The rate is display-only for the "they receive about ₦X" line - it does not affect
// the fee comparison (which uses FEE_QUOTES, not the FX rate).

import { useEffect, useState } from "react";
import { MOCK_USD_NGN_RATE } from "@/lib/corridor";

const LIVE_URL = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_RATE = MOCK_USD_NGN_RATE;

let cachedRate: number | null = null;
let inFlight: Promise<number> | null = null;

function fetchLiveRate(): Promise<number> {
  if (cachedRate !== null) return Promise.resolve(cachedRate);
  if (!inFlight) {
    inFlight = (async () => {
      const res = await fetch(LIVE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`fx fetch ${res.status}`);
      const data = (await res.json()) as { rates?: Record<string, number> };
      const ngn = data?.rates?.NGN;
      if (typeof ngn !== "number" || !isFinite(ngn) || ngn <= 0) {
        throw new Error("fx payload missing NGN rate");
      }
      cachedRate = ngn;
      return ngn;
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export interface FxRate {
  /** Convert USD to NGN using the currently-known rate (live or sample). */
  toNgn: (usd: number) => number;
  /** Convert NGN to USD using the currently-known rate (live or sample). */
  toUsd: (ngn: number) => number;
  /** True once a live rate has been fetched this session. */
  isLive: boolean;
  /** Still waiting on the first fetch. */
  loading: boolean;
  /** Short, honest label for the badge next to a ₦ figure. */
  label: string;
  /** Human-readable source ("open.er-api.com" or "sample"). */
  source: string;
}

export function useFxRate(): FxRate {
  const [rate, setRate] = useState<number>(FALLBACK_RATE);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchLiveRate()
      .then((r) => {
        if (!alive) return;
        setRate(r);
        setIsLive(true);
      })
      .catch(() => {
        // Live rate unavailable - keep the sample. The label stays "SAMPLE RATE".
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return {
    toNgn: (usd) => usd * rate,
    toUsd: (ngn) => ngn / rate,
    isLive,
    loading,
    label: isLive ? "LIVE RATE" : "SAMPLE RATE",
    source: isLive ? "open.er-api.com" : "sample",
  };
}
