import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

type NumericLike = number | string | null;

export type BudgetGoalStatus = 'under_budget' | 'on_track' | 'over_budget' | 'inactive';

export type BudgetSummaryData = {
  monthly_budget: NumericLike;
  spent: NumericLike;
  remaining: NumericLike;
  usage_rate: NumericLike;
  over_budget_amount: NumericLike;
  is_over_budget: boolean;
};

export type BudgetGoalRecord = {
  id: number;
  user_id: number;
  category_id: number;
  category_name: string;
  category_type: string;
  monthly_amount: NumericLike;
  created_at: string;
  updated_at: string;
  current_amount?: NumericLike;
  remaining_amount?: NumericLike;
  progress_percentage?: NumericLike;
  status?: BudgetGoalStatus;
};

export type BudgetGoalListData = {
  summary: BudgetSummaryData;
  items: BudgetGoalRecord[];
};

export type CreateBudgetGoalPayload = {
  category_id: number;
  monthly_amount: number;
};

export type UpdateBudgetGoalPayload = Partial<CreateBudgetGoalPayload>;

export type ListBudgetGoalsParams = {
  month?: string;
};

const buildBudgetsUrl = (path = '') => buildApiUrl(`budgets/category-goals${path ? `/${path}` : ''}`);

const withQuery = (url: string, params?: ListBudgetGoalsParams) => {
  if (!params) {
    return url;
  }

  const searchParams = new URLSearchParams();

  if (params.month) {
    searchParams.set('month', params.month);
  }

  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
};

export const listBudgetGoals = (accessToken: string, params?: ListBudgetGoalsParams) =>
  request<ApiEnvelope<BudgetGoalListData>>(withQuery(buildBudgetsUrl(), params), {
    method: 'GET',
    token: accessToken,
  });

export const createBudgetGoal = (accessToken: string, payload: CreateBudgetGoalPayload) =>
  request<ApiEnvelope<BudgetGoalRecord>>(buildBudgetsUrl(), {
    method: 'POST',
    token: accessToken,
    body: payload,
  });

export const updateBudgetGoal = (accessToken: string, id: number, payload: UpdateBudgetGoalPayload) =>
  request<ApiEnvelope<BudgetGoalRecord>>(buildBudgetsUrl(String(id)), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const deleteBudgetGoal = (accessToken: string, id: number) =>
  request<ApiEnvelope<{ status: 'deleted' }>>(buildBudgetsUrl(String(id)), {
    method: 'DELETE',
    token: accessToken,
  });
