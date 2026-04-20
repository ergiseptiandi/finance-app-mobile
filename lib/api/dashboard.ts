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
  net_cashflow?: NumericLike;
  savings_rate?: NumericLike;
  expense_ratio?: NumericLike;
  debt?: DashboardDebtData | null;
  budget_summary?: DashboardBudgetSummary | null;
  category_breakdown_preview?: DashboardCategoryBreakdownPreviewItem[];
  upcoming_bills?: DashboardUpcomingBillsData | null;
  top_merchants_preview?: DashboardTopMerchantPreviewItem[];
  alerts?: DashboardAlertData[];
  goals_progress?: DashboardGoalProgressData[];
};

export type DashboardDebtData = {
  total_debt: NumericLike;
  paid_debt: NumericLike;
  remaining_debt: NumericLike;
  total_debt_count: NumericLike;
  active_debt_count: NumericLike;
  overdue_debt_count: NumericLike;
  paid_installments: NumericLike;
  overdue_installments: NumericLike;
  upcoming_due_amount: NumericLike;
  upcoming_due_installments: NumericLike;
  debt_to_income_ratio: NumericLike;
  debt_to_balance_ratio: NumericLike;
  completion_rate: NumericLike;
};

export type DashboardBudgetSummary = {
  monthly_budget: NumericLike;
  spent: NumericLike;
  remaining: NumericLike;
  usage_rate: NumericLike;
  over_budget_amount: NumericLike;
  is_over_budget: boolean;
};

export type DashboardCategoryBreakdownPreviewItem = {
  category: string;
  amount: NumericLike;
  percentage: NumericLike;
};

export type DashboardUpcomingBillsData = {
  count: NumericLike;
  total_amount: NumericLike;
  next_due_date?: string | null;
};

export type DashboardTopMerchantPreviewItem = {
  merchant_name: string;
  amount: NumericLike;
  transaction_count: NumericLike;
};

export type DashboardAlertData = {
  type: string;
  code: string;
  title: string;
  message: string;
  severity?: string;
  change_value?: NumericLike;
};

export type DashboardGoalProgressData = {
  name: string;
  target_amount: NumericLike;
  current_amount: NumericLike;
  progress_percentage: NumericLike;
  target_date?: string | null;
  status?: string;
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
