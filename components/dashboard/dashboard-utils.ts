import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  type DashboardComparisonData,
  type DashboardPeriodParams,
} from '@/lib/api/dashboard';

export type TrendMode = 'daily' | 'monthly';
export type DashboardDateFilterMode = 'month' | 'range';

export type TrendPoint = {
  label: string;
  value: number;
  active?: boolean;
};

export type DashboardFilters = {
  dateMode: DashboardDateFilterMode;
  month: string;
  startDate: string;
  endDate: string;
};

export type MonthPickerState = {
  year: number;
  monthIndex: number;
};

export const MONTH_INPUT_PATTERN = /^\d{4}-\d{2}$/;
export const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index);

export const getCurrentMonthInputValue = () => new Date().toISOString().slice(0, 7);

export const getMonthPickerStateFromInput = (value: string): MonthPickerState => {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return {
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      monthIndex: Number.isFinite(month) ? Math.min(11, Math.max(0, month - 1)) : new Date().getMonth(),
    };
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  };
};

export const createDefaultDashboardFilters = (): DashboardFilters => ({
  dateMode: 'month',
  month: getCurrentMonthInputValue(),
  startDate: '',
  endDate: '',
});

export const buildDashboardQueryParams = (filters: DashboardFilters): DashboardPeriodParams => {
  if (filters.dateMode === 'month') {
    return { month: filters.month };
  }
  return { start_date: filters.startDate, end_date: filters.endDate };
};

export const createDashboardCacheSuffix = (filters: DashboardFilters) =>
  [filters.dateMode, filters.month, filters.startDate, filters.endDate].join('|');

export const formatCompactCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 0 }).format(value);

export const formatDetailCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

export const formatSignedCurrency = (value: number, locale: string) => {
  const formatted = formatDetailCurrency(Math.abs(value), locale);
  return value >= 0 ? formatted : `-${formatted}`;
};

export const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export const toNumber = (value: unknown) => {
  const nextValue = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

export const parseDateValue = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toPickerDate = (value: string) => {
  const parsed = parseDateValue(value);
  return parsed || new Date();
};

export const toDateInputLabel = (value: string, locale: string) => {
  const parsed = toPickerDate(value);
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }).format(parsed);
};

export const toMonthInputLabel = (value: string, locale: string) => {
  if (!MONTH_INPUT_PATTERN.test(value)) return value;
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(parsed);
};

export const getFilterRangeMonths = (startDate: string, endDate: string) => {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!start || !end) return Number.POSITIVE_INFINITY;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
};

export const getDashboardFilterLabel = (filters: DashboardFilters, locale: string) => {
  if (filters.dateMode === 'month') return toMonthInputLabel(filters.month, locale);
  if (!DATE_INPUT_PATTERN.test(filters.startDate) || !DATE_INPUT_PATTERN.test(filters.endDate)) return '';
  return `${toDateInputLabel(filters.startDate, locale)} - ${toDateInputLabel(filters.endDate, locale)}`;
};

export const toDashboardFilterPickerValue = (filters: DashboardFilters, target: 'month' | 'startDate' | 'endDate') => {
  if (target === 'month') return toPickerDate(`${filters.month}-01`);
  if (target === 'startDate') return toPickerDate(filters.startDate);
  return toPickerDate(filters.endDate);
};

export const toDayLabel = (value: string, fallback: string, locale: string) => {
  const date = parseDateValue(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date);
};

export const toShortMonth = (value: string, fallback: string, locale: string) => {
  const date = parseDateValue(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).toUpperCase();
};

export const extractComparisonValue = (data: DashboardComparisonData | null, keys: string[]) => {
  if (!data) return 0;
  for (const key of keys) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return 0;
};

export const extractComparisonWindowValue = (
  data: DashboardComparisonData | null,
  windowKey: keyof Pick<DashboardComparisonData, 'today_vs_yesterday' | 'this_month_vs_last_month'>,
  field: keyof NonNullable<DashboardComparisonData['today_vs_yesterday']>
) => toNumber(data?.[windowKey]?.[field]);

export const formatExpenseCurrency = (value: number, locale: string) => {
  if (value <= 0) return formatDetailCurrency(0, locale);
  return formatSignedCurrency(-Math.abs(value), locale);
};

export const formatPercentValue = (value: number) => `${Math.round(value)}%`;

export const getInsightTone = (severity?: string) => {
  switch (severity) {
    case 'critical': return 'danger' as const;
    case 'warning': return 'warning' as const;
    default: return 'primary' as const;
  }
};

export const getInsightIcon = (severity?: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  switch (severity) {
    case 'critical': return 'alert-octagon-outline';
    case 'warning': return 'alert-outline';
    default: return 'information-outline';
  }
};

export const normalizeCategoryLabel = (category: string, language: string) => {
  const normalized = category.trim().toLowerCase();
  if (normalized === 'debt payment') return language === 'id' ? 'Pembayaran utang' : 'Debt payment';
  return category.trim();
};

export const getCategoryIcon = (category: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('debt payment') || normalized.includes('pembayaran utang')) return 'bank-transfer';
  if (normalized.includes('food') || normalized.includes('makan') || normalized.includes('dining')) return 'silverware-fork-knife';
  if (normalized.includes('transport') || normalized.includes('transpor') || normalized.includes('travel')) return 'train-car';
  if (normalized.includes('shopping') || normalized.includes('belanja')) return 'shopping-outline';
  if (normalized.includes('health') || normalized.includes('kesehatan')) return 'heart-pulse';
  if (normalized.includes('bill') || normalized.includes('tagihan') || normalized.includes('utility')) return 'receipt-text-outline';
  if (normalized.includes('salary') || normalized.includes('income') || normalized.includes('pendapatan')) return 'cash-multiple';
  return 'shape-outline';
};
