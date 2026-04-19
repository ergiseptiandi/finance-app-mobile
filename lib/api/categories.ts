import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

export type CategoryType = 'income' | 'expense';

export type CategoryRecord = {
  id: number;
  name: string;
  type: CategoryType;
  created_at: string;
  updated_at: string;
};

export type CreateCategoryPayload = {
  name: string;
  type: CategoryType;
};

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>;

export type ListCategoriesParams = {
  type?: CategoryType;
};

const buildCategoriesUrl = (path = '') => buildApiUrl(`categories${path ? `/${path}` : ''}`);

const withQuery = (url: string, params: ListCategoriesParams) => {
  const searchParams = new URLSearchParams();

  if (params.type) {
    searchParams.set('type', params.type);
  }

  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
};

export const listCategories = (accessToken: string, params: ListCategoriesParams = {}) =>
  request<ApiEnvelope<CategoryRecord[]>>(withQuery(buildCategoriesUrl(), params), {
    method: 'GET',
    token: accessToken,
  });

export const createCategory = (accessToken: string, payload: CreateCategoryPayload) =>
  request<ApiEnvelope<CategoryRecord>>(buildCategoriesUrl(), {
    method: 'POST',
    token: accessToken,
    body: payload,
  });

export const updateCategory = (accessToken: string, id: number, payload: UpdateCategoryPayload) =>
  request<ApiEnvelope<CategoryRecord>>(buildCategoriesUrl(String(id)), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const deleteCategory = (accessToken: string, id: number) =>
  request<ApiEnvelope<{ status: 'deleted' }>>(buildCategoriesUrl(String(id)), {
    method: 'DELETE',
    token: accessToken,
  });
