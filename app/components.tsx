"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { KIND_LABEL, NETWORK_LABEL, STATUS_LABEL, type Kind, type Network, type Promo, type Status } from "@/lib/client";
import { shortDate } from "@/lib/dates";
import { daysLeft } from "@/lib/promos";

/** Props for the field a drawer opens on: autoFocus for when it appears in an open drawer, data-autofocus for Drawer's showModal. */
export function focusHere(on = true) {
  return on ? { autoFocus: true, "data-autofocus": "" } : {};
}

/**
 * A panel that slides in from the right for adding or editing one thing, or reference material, so the page behind
 * keeps its full width. A modal <dialog>: Esc, the close button or a click on the dimmed page closes it. From Budge.
 */
export function Drawer({ open, title, onClose, wide, children }: { open: boolean; title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) {
      d.showModal();
      // showModal moves focus to the first button (Close); put it back on the field marked by focusHere, if any.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d?.open) d.close();
  }, [open]);
  return <dialog ref={ref} className={`drawer ${wide ? "wide" : ""}`} aria-label={title} onClose={onClose}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    {open && <div className="drawer-inner">
      <div className="drawer-head"><h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button></div>
      <div className="drawer-body">{children}</div>
    </div>}
  </dialog>;
}

export function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="card"><div className="label">{label}</div><div className="value">{value}</div>
    {hint && <div className="hint">{hint}</div>}</div>;
}

/** Share of a minimum spend reached: full and green once it's met. */
export function Meter({ share }: { share: number }) {
  const met = share >= 1;
  return <span className={`meter ${met ? "met" : ""}`} role="img" aria-label={met ? "Minimum spend reached" : `${Math.floor(share * 100)}% of the minimum spend`}>
    <b style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%` }} />
  </span>;
}

export const KindChip = ({ kind }: { kind: Kind }) => <span className={`chip kind ${kind}`}>{KIND_LABEL[kind]}</span>;
export const StatusChip = ({ status }: { status: Status }) => <span className={`chip status ${status}`}>{STATUS_LABEL[status]}</span>;
export const networkNames = (networks: Network[]) => (networks.length ? networks.map((n) => NETWORK_LABEL[n]).join(", ") : "Any card");

/** When a promo ends: "Ends today", "3 days left", "Ended Oct 30", or its date; soon (a week or less) stands out. */
export function Ends({ promo, today }: { promo: Promo; today: string }) {
  const left = daysLeft(promo, today);
  if (left === null) return <span className="muted">No end date</span>;
  if (left < 0) return <span className="muted">Ended {shortDate(promo.ends, today)}</span>;
  if (left === 0) return <span className="ends today">Ends today</span>;
  if (left <= 7) return <span className="ends soon">{left} day{left === 1 ? "" : "s"} left</span>;
  return <span>{shortDate(promo.ends, today)}</span>;
}
