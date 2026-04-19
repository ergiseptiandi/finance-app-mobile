import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

type NumericLike = number | string | null;

export type DashboardSummaryData = {
  total_balance: NumericLike;
  monthly_income: NumericLike;
  monthly_expense: NumericLike;
};

export type DailySpendingItem = {
  date: string;
  amount: NumericLike;
};

export type MonthlySpendingItem = {
  month?: string;
  label?: string;
  date?: string;
  amount: NumericLike;
};

export type DashboardComparisonData = {
  today_expense?: NumericLike;
  yesterday_expense?: NumericLike;
  this_month_expense?: NumericLike;
  last_month_expense?: NumericLike;
  today?: NumericLike;
  yesterday?: NumericLike;
  this_month?: NumericLike;
  last_month?: NumericLike;
  todayAmount?: NumericLike;
  yesterdayAmount?: NumericLike;
  thisMonth?: NumericLike;
  lastMonth?: NumericLike;
};

export type ExpenseVsSalaryData = {
  expense_amount?: NumericLike;
  salary_amount?: NumericLike;
  percentage?: NumericLike;
  expense?: NumericLike;
  salary?: NumericLike;
};

export type DashboardPeriodParams = {
  month?: string;
  start_date?: string;
  end_date?: string;
};

const withQueryParams = (url: string, params?: DashboardPeriodParams) => {
  if (!params) {
    return url;
  }

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

export const getDashboardSummary = (accessToken: string, params?: DashboardPeriodParams) =>
  request<ApiEnvelope<DashboardSummaryData>>(withQueryParams(buildApiUrl('dashboard/summary'), params), {
    method: 'GET',
    token: accessToken,
  });

export const getDailySpending = (accessToken: string, params?: DashboardPeriodParams) =>
  request<ApiEnvelope<DailySpendingItem[]>>(
    withQueryParams(buildApiUrl('dashboard/daily-spending'), params),
    {
      method: 'GET',
      token: accessToken,
    }
  );

export const getMonthlySpending = (accessToken: string, params?: DashboardPeriodParams) =>
  request<ApiEnvelope<MonthlySpendingItem[]>>(
    withQueryParams(buildApiUrl('dashboard/monthly-spending'), params),
    {
      method: 'GET',
      token: accessToken,
    }
  );

export const getComparison = (accessToken: string) =>
  request<ApiEnvelope<DashboardComparisonData>>(buildApiUrl('dashboard/comparison'), {
    method: 'GET',
    token: accessToken,
  });

export const getExpenseVsSalary = (accessToken: string) =>
  request<ApiEnvelope<ExpenseVsSalaryData>>(buildApiUrl('dashboard/expense-vs-salary'), {
    method: 'GET',
    token: accessToken,
  });
