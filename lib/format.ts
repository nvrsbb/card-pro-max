// Amounts on screen, all through money() so the eye button in the page bar can hide them.

let hidden = false;

/** Set by the page frame from the eye button; every money() call after it follows. */
export function hideValues(on: boolean): void { hidden = on; }

/** "₱10,000" or "₱1,234.50"; "₱•••" while amounts are hidden. */
export function money(amount: number): string {
  if (hidden) return "₱•••";
  const whole = Math.abs(amount % 1) < 0.005;
  return `${amount < 0 ? "−" : ""}₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** A plain number from what was typed: "10,000", "₱ 2,500.50"; NaN when it isn't one. */
export function parseAmount(text: string): number {
  const clean = text.replace(/[₱,\s]|php/gi, "");
  return clean === "" ? NaN : Number(clean);
}
