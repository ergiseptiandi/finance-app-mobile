import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

type NumericLike = number | string | null;

export type ReportsPeriodParams = {
  month?: string;
  year?: string;
  start_date?: string;
  end_date?: string;
};

export type ReportsPeriodData = {
  mode?: string;
  month?: string | null;
  year?: string | number | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type ExpenseByCategoryItem = {
  category: string;
  amount: NumericLike;
  percentage: NumericLike;
  transaction_count?: NumericLike;
};

export type ExpenseByCategoryData = {
  period?: ReportsPeriodData;
  summary?: {
    total_expense?: NumericLike;
    category_count?: NumericLike;
    top_category?: string;
  };
  items: ExpenseByCategoryItem[];
};

export type SpendingTrendItem = {
  period?: string;
  income?: NumericLike;
  expense?: NumericLike;
  net_cashflow?: NumericLike;
  month?: string;
  date?: string;
  label?: string;
  amount?: NumericLike;
};

export type SpendingTrendsData = {
  period?: ReportsPeriodData;
  group_by?: string;
  items: SpendingTrendItem[];
};

export type HighestSpendingCategoryData = {
  period?: ReportsPeriodData;
  category: string;
  amount: NumericLike;
  percentage: NumericLike;
  transaction_count?: NumericLike;
};

export type AverageDailySpendingData = {
  period?: ReportsPeriodData;
  total_expense: NumericLike;
  days_count?: NumericLike;
  elapsed_days?: NumericLike;
  average_daily_spending: NumericLike;
  highest_daily_spending?: NumericLike;
  lowest_daily_spending?: NumericLike;
};

export type RemainingBalanceData = {
  period?: ReportsPeriodData;
  total_income: NumericLike;
  total_expense: NumericLike;
  remaining_balance: NumericLike;
  savings_rate?: NumericLike;
  expense_ratio?: NumericLike;
};

const buildReportsUrl = (path = '') => buildApiUrl(`reports${path ? `/${path}` : ''}`);

const withQueryParams = (url: string, params: ReportsPeriodParams = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
};

export const getExpenseByCategory = (accessToken: string, params: ReportsPeriodParams = {}) =>
  request<ApiEnvelope<ExpenseByCategoryData>>(withQueryParams(buildReportsUrl('expense-by-category'), params), {
    method: 'GET',
    token: accessToken,
  });

export const getSpendingTrends = (accessToken: string, params: ReportsPeriodParams = {}) =>
  request<ApiEnvelope<SpendingTrendsData>>(withQueryParams(buildReportsUrl('spending-trends'), params), {
    method: 'GET',
    token: accessToken,
  });

export const getHighestSpendingCategory = (accessToken: string, params: ReportsPeriodParams = {}) =>
  request<ApiEnvelope<HighestSpendingCategoryData>>(
    withQueryParams(buildReportsUrl('highest-spending-category'), params),
    {
      method: 'GET',
      token: accessToken,
    }
  );

export const getAverageDailySpending = (accessToken: string, params: ReportsPeriodParams = {}) =>
  request<ApiEnvelope<AverageDailySpendingData>>(withQueryParams(buildReportsUrl('average-daily-spending'), params), {
    method: 'GET',
    token: accessToken,
  });

export const getRemainingBalance = (accessToken: string, params: ReportsPeriodParams = {}) =>
  request<ApiEnvelope<RemainingBalanceData>>(withQueryParams(buildReportsUrl('remaining-balance'), params), {
    method: 'GET',
    token: accessToken,
  });
