import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

type NumericLike = number | string | null;

export type ExpenseByCategoryItem = {
  category: string;
  amount: NumericLike;
  percentage: NumericLike;
};

export type SpendingTrendItem = {
  month?: string;
  date?: string;
  label?: string;
  amount: NumericLike;
};

export type HighestSpendingCategoryData = {
  category: string;
  amount: NumericLike;
  percentage: NumericLike;
};

export type AverageDailySpendingData = {
  total_expense: NumericLike;
  elapsed_days: NumericLike;
  average_daily_spending: NumericLike;
};

export type RemainingBalanceData = {
  total_income: NumericLike;
  total_expense: NumericLike;
  remaining_balance: NumericLike;
};

const buildReportsUrl = (path = '') => buildApiUrl(`reports${path ? `/${path}` : ''}`);

export const getExpenseByCategory = (accessToken: string) =>
  request<ApiEnvelope<ExpenseByCategoryItem[]>>(buildReportsUrl('expense-by-category'), {
    method: 'GET',
    token: accessToken,
  });

export const getSpendingTrends = (accessToken: string) =>
  request<ApiEnvelope<SpendingTrendItem[]>>(buildReportsUrl('spending-trends'), {
    method: 'GET',
    token: accessToken,
  });

export const getHighestSpendingCategory = (accessToken: string) =>
  request<ApiEnvelope<HighestSpendingCategoryData>>(buildReportsUrl('highest-spending-category'), {
    method: 'GET',
    token: accessToken,
  });

export const getAverageDailySpending = (accessToken: string) =>
  request<ApiEnvelope<AverageDailySpendingData>>(buildReportsUrl('average-daily-spending'), {
    method: 'GET',
    token: accessToken,
  });

export const getRemainingBalance = (accessToken: string) =>
  request<ApiEnvelope<RemainingBalanceData>>(buildReportsUrl('remaining-balance'), {
    method: 'GET',
    token: accessToken,
  });
