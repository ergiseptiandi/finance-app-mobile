import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

export type TransactionType = 'income' | 'expense';

export type TransactionRecord = {
  id: number;
  user_id: number;
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type TransactionListData = {
  data: TransactionRecord[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

export type TransactionSummaryData = {
  total_income: number;
  total_expense: number;
  balance: number;
};

export type CreateTransactionPayload = {
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  description: string;
};

export type UpdateTransactionPayload = Partial<CreateTransactionPayload>;

export type ListTransactionsParams = {
  start_date?: string;
  end_date?: string;
  category?: string;
  type?: TransactionType;
  page?: number;
  per_page?: number;
};

const buildTransactionsUrl = (path = '') => buildApiUrl(`transactions${path ? `/${path}` : ''}`);

const withQueryParams = (url: string, params: ListTransactionsParams) => {
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

export const createTransaction = (accessToken: string, payload: CreateTransactionPayload) =>
  request<ApiEnvelope<TransactionRecord>>(buildTransactionsUrl(), {
    method: 'POST',
    token: accessToken,
    body: payload,
  });

export const listTransactions = (accessToken: string, params: ListTransactionsParams = {}) =>
  request<ApiEnvelope<TransactionListData>>(withQueryParams(buildTransactionsUrl(), params), {
    method: 'GET',
    token: accessToken,
  });

export const getTransactionSummary = (accessToken: string) =>
  request<ApiEnvelope<TransactionSummaryData>>(buildTransactionsUrl('summary'), {
    method: 'GET',
    token: accessToken,
  });

export const getTransactionDetail = (accessToken: string, id: number) =>
  request<ApiEnvelope<TransactionRecord>>(buildTransactionsUrl(String(id)), {
    method: 'GET',
    token: accessToken,
  });

export const updateTransaction = (accessToken: string, id: number, payload: UpdateTransactionPayload) =>
  request<ApiEnvelope<TransactionRecord>>(buildTransactionsUrl(String(id)), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const deleteTransaction = (accessToken: string, id: number) =>
  request<ApiEnvelope<{ status: 'deleted' }>>(buildTransactionsUrl(String(id)), {
    method: 'DELETE',
    token: accessToken,
  });
