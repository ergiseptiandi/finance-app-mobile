import type { InstallmentRecord } from '@/lib/api/debts';

export type BillingSummaryResult = {
    currentMonthTotal: number;
    nextMonthTotal: number;
    currentMonthLabel: string; // "YYYY-MM"
    nextMonthLabel: string; // "YYYY-MM"
};

/**
 * Coerce a value (number | string | null) to a finite number.
 * Mirrors the existing `toNumber` pattern from dashboard-utils.
 */
export const toNumber = (value: unknown): number => {
    const nextValue = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(nextValue) ? nextValue : 0;
};

/**
 * Get the start of a month (day 1, 00:00:00.000) in local timezone.
 */
const startOfMonth = (date: Date): Date =>
    new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

/**
 * Get the end of a month (last day, 23:59:59.999) in local timezone.
 */
const endOfMonth = (date: Date): Date =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

/**
 * Format a date as "YYYY-MM" label.
 */
const formatMonthLabel = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

/**
 * Parse a due_date string into a Date object in local timezone.
 * Returns null if the date is unparseable or invalid.
 */
const parseDueDate = (dueDate: string): Date | null => {
    if (!dueDate || typeof dueDate !== 'string') return null;

    const parsed = new Date(dueDate);
    if (isNaN(parsed.getTime())) return null;

    return parsed;
};

/**
 * Check if a date falls within a range (inclusive).
 */
const isWithinRange = (date: Date, start: Date, end: Date): boolean =>
    date.getTime() >= start.getTime() && date.getTime() <= end.getTime();

/**
 * Calculate billing summary totals for the current month and next month.
 *
 * Filters installments where status !== 'paid' and due_date falls within
 * the respective month range, then sums amounts using toNumber coercion.
 *
 * @param installments - Array of InstallmentRecord objects
 * @param referenceDate - The reference date to determine current/next month
 * @returns BillingSummaryResult with totals and month labels
 */
export function calculateBillingSummary(
    installments: InstallmentRecord[],
    referenceDate: Date
): BillingSummaryResult {
    const currentMonthStart = startOfMonth(referenceDate);
    const currentMonthEnd = endOfMonth(referenceDate);

    const nextMonthDate = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth() + 1,
        1
    );
    const nextMonthStart = startOfMonth(nextMonthDate);
    const nextMonthEnd = endOfMonth(nextMonthDate);

    let currentMonthTotal = 0;
    let nextMonthTotal = 0;

    for (const installment of installments) {
        // Skip paid installments
        if (installment.status === 'paid') continue;

        // Parse due_date — exclude unparseable dates
        const dueDate = parseDueDate(installment.due_date);
        if (!dueDate) continue;

        const amount = toNumber(installment.amount);

        if (isWithinRange(dueDate, currentMonthStart, currentMonthEnd)) {
            currentMonthTotal += amount;
        }

        if (isWithinRange(dueDate, nextMonthStart, nextMonthEnd)) {
            nextMonthTotal += amount;
        }
    }

    return {
        currentMonthTotal,
        nextMonthTotal,
        currentMonthLabel: formatMonthLabel(currentMonthStart),
        nextMonthLabel: formatMonthLabel(nextMonthStart),
    };
}
