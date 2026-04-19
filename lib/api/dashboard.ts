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

export const getDashboardSummary = (accessToken: string) =>
  request<ApiEnvelope<DashboardSummaryData>>(buildApiUrl('dashboard/summary'), {
    method: 'GET',
    token: accessToken,
  });

export const getDailySpending = (accessToken: string) =>
  request<ApiEnvelope<DailySpendingItem[]>>(buildApiUrl('dashboard/daily-spending'), {
    method: 'GET',
    token: accessToken,
  });

export const getMonthlySpending = (accessToken: string) =>
  request<ApiEnvelope<MonthlySpendingItem[]>>(buildApiUrl('dashboard/monthly-spending'), {
    method: 'GET',
    token: accessToken,
  });

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
