"use client";

import { MessageSquareHeart, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IS_STATIC } from "@/lib/site";

const KEY = "hoomanely:prototype-banner-dismissed";

/** On the shared prototype: explains it's sample data and points to Feedback. Dismissible per browser. */
export function PrototypeBanner() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the dismissal once after hydration
      setHidden(window.localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (!IS_STATIC || hidden || pathname.startsWith("/feedback")) return null;
  return (
    <div className="flex items-center gap-3 border-b border-border bg-primary-soft px-4 py-2 text-[13px] text-primary-soft-fg sm:px-6 lg:px-8">
      <MessageSquareHeart className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Prototype with sample data.</span> Click around freely; your changes stay in your browser.{" "}
        <Link href="/feedback" className="font-semibold underline underline-offset-2">
          Tell us what you think →
        </Link>
      </p>
      <button
        onClick={() => {
          setHidden(true);
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            // Ignore: storage may be unavailable.
          }
        }}
        className="rounded-md p-1 hover:bg-black/5"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
