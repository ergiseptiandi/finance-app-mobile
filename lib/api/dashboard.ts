import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

export type DashboardSummaryData = {
  total_balance: number;
  monthly_income: number;
  monthly_expense: number;
};

export type DailySpendingItem = {
  date: string;
  amount: number;
};

export type MonthlySpendingItem = {
  month?: string;
  label?: string;
  date?: string;
  amount: number;
};

export type DashboardComparisonData = {
  today_expense?: number;
  yesterday_expense?: number;
  this_month_expense?: number;
  last_month_expense?: number;
};

export type ExpenseVsSalaryData = {
  expense_amount?: number;
  salary_amount?: number;
  percentage?: number;
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
