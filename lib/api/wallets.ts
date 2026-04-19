import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

type NumericLike = number | string | null;

export type WalletRecord = {
  id: number;
  name: string;
  opening_balance: NumericLike;
  balance: NumericLike;
  created_at: string;
  updated_at: string;
};

export type WalletSummaryData = {
  total_balance: NumericLike;
  wallets: WalletRecord[];
};

export type CreateWalletPayload = {
  name: string;
  opening_balance: number;
};

export type UpdateWalletPayload = Partial<CreateWalletPayload>;

export type WalletTransferRecord = {
  id: number;
  from_wallet_id?: NumericLike;
  to_wallet_id?: NumericLike;
  from_wallet_name?: string;
  to_wallet_name?: string;
  amount: NumericLike;
  note?: string;
  transfer_date?: string;
  created_at?: string;
  updated_at?: string;
};

export type CreateWalletTransferPayload = {
  from_wallet_id: number;
  to_wallet_id: number;
  amount: number;
  note?: string;
  transfer_date: string;
};

export type ListWalletsData = WalletRecord[];

export type ListTransfersData = WalletTransferRecord[];

const buildWalletsUrl = (path = '') => buildApiUrl(`wallets${path ? `/${path}` : ''}`);
const buildTransfersUrl = () => buildApiUrl('wallet-transfers');

export const getWalletSummary = (accessToken: string) =>
  request<ApiEnvelope<WalletSummaryData>>(buildWalletsUrl('summary'), {
    method: 'GET',
    token: accessToken,
  });

export const listWallets = (accessToken: string) =>
  request<ApiEnvelope<ListWalletsData>>(buildWalletsUrl(), {
    method: 'GET',
    token: accessToken,
  });

export const createWallet = (accessToken: string, payload: CreateWalletPayload) =>
  request<ApiEnvelope<WalletRecord>>(buildWalletsUrl(), {
    method: 'POST',
    token: accessToken,
    body: payload,
  });

export const updateWallet = (accessToken: string, id: number, payload: UpdateWalletPayload) =>
  request<ApiEnvelope<WalletRecord>>(buildWalletsUrl(String(id)), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const deleteWallet = (accessToken: string, id: number) =>
  request<ApiEnvelope<{ status: 'deleted' }>>(buildWalletsUrl(String(id)), {
    method: 'DELETE',
    token: accessToken,
  });

export const createWalletTransfer = (accessToken: string, payload: CreateWalletTransferPayload) =>
  request<ApiEnvelope<WalletTransferRecord>>(buildTransfersUrl(), {
    method: 'POST',
    token: accessToken,
    body: payload,
  });

export const listWalletTransfers = (accessToken: string) =>
  request<ApiEnvelope<ListTransfersData>>(buildTransfersUrl(), {
    method: 'GET',
    token: accessToken,
  });
