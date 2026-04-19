import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

type NumericLike = number | string | null;

export type DebtStatus = 'pending' | 'paid' | 'overdue' | string;
export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | string;

export type DebtRecord = {
  id: number;
  user_id?: number;
  name: string;
  total_amount: NumericLike;
  monthly_installment: NumericLike;
  due_date: string;
  paid_amount: NumericLike;
  remaining_amount: NumericLike;
  status: DebtStatus;
  paid_installments: NumericLike;
  unpaid_installments: NumericLike;
  overdue_installments: NumericLike;
  created_at?: string;
  updated_at?: string;
};

export type InstallmentRecord = {
  id: number;
  debt_id: number;
  installment_no: number;
  due_date: string;
  amount: NumericLike;
  status: InstallmentStatus;
  paid_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DebtPaymentRecord = {
  id: number;
  debt_id: number;
  wallet_id?: NumericLike;
  installment_id?: number | null;
  amount: NumericLike;
  payment_date: string;
  proof_image: string;
  created_at: string;
  updated_at: string;
};

export type DebtDetail = DebtRecord & {
  installments: InstallmentRecord[];
  payments: DebtPaymentRecord[];
};

export type CreateDebtPayload = {
  name: string;
  total_amount: number;
  monthly_installment: number;
  due_date: string;
};

export type UpdateDebtPayload = Partial<CreateDebtPayload>;

export type CreateDebtPaymentPayload = FormData;
export type UpdateDebtPaymentPayload = FormData;

export type MarkInstallmentPaidPayload = {
  paid_at: string;
};

const buildDebtsUrl = (path = '') => buildApiUrl(`debts${path ? `/${path}` : ''}`);
const buildDebtActionUrl = (id: number, path = '') =>
  buildDebtsUrl(`${id}${path ? `/${path}` : ''}`);

export const listDebts = (accessToken: string) =>
  request<ApiEnvelope<DebtRecord[]>>(buildDebtsUrl(), {
    method: 'GET',
    token: accessToken,
  });

export const getDebtDetail = (accessToken: string, id: number) =>
  request<ApiEnvelope<DebtDetail>>(buildDebtActionUrl(id), {
    method: 'GET',
    token: accessToken,
  });

export const createDebt = (accessToken: string, payload: CreateDebtPayload) =>
  request<ApiEnvelope<DebtDetail>>(buildDebtsUrl(), {
    method: 'POST',
    token: accessToken,
    body: payload,
  });

export const updateDebt = (accessToken: string, id: number, payload: UpdateDebtPayload) =>
  request<ApiEnvelope<DebtDetail>>(buildDebtActionUrl(id), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const deleteDebt = (accessToken: string, id: number) =>
  request<ApiEnvelope<{ status: 'deleted' }>>(buildDebtActionUrl(id), {
    method: 'DELETE',
    token: accessToken,
  });

export const createDebtPayment = (accessToken: string, id: number, payload: CreateDebtPaymentPayload) =>
  request<ApiEnvelope<DebtPaymentRecord>>(buildDebtActionUrl(id, 'payments'), {
    method: 'POST',
    token: accessToken,
    body: payload,
  });

export const updateDebtPayment = (
  accessToken: string,
  id: number,
  paymentId: number,
  payload: UpdateDebtPaymentPayload
) =>
  request<ApiEnvelope<DebtPaymentRecord>>(buildDebtActionUrl(id, `payments/${paymentId}`), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const getDebtPayments = (accessToken: string, id: number) =>
  request<ApiEnvelope<DebtPaymentRecord[]>>(buildDebtActionUrl(id, 'payments'), {
    method: 'GET',
    token: accessToken,
  });

export const getDebtInstallments = (accessToken: string, id: number) =>
  request<ApiEnvelope<InstallmentRecord[]>>(buildDebtActionUrl(id, 'installments'), {
    method: 'GET',
    token: accessToken,
  });

export const markInstallmentAsPaid = (
  accessToken: string,
  id: number,
  installmentId: number,
  payload: MarkInstallmentPaidPayload
) =>
  request<ApiEnvelope<InstallmentRecord>>(buildDebtActionUrl(id, `installments/${installmentId}/paid`), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });
