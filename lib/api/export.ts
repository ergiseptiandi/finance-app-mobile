import { buildApiUrl } from '@/constants/api';
import { ApiRequestError } from '@/lib/api/client';

export type ExportScope = 'transactions' | 'debts' | 'reports';
export type ExportPeriodMode = 'month' | 'custom';
export type ExportFileFormat = 'csv' | 'xlsx';

export type ExportCsvParams = {
  scope: ExportScope;
  month?: string;
  startDate?: string;
  endDate?: string;
  language?: 'id' | 'en';
};

export type ExportCsvResult = {
  csv: string;
  fileName: string;
  partial: boolean;
  recordCount: number;
};

export type ExportXlsxResult = {
  xlsx: Uint8Array;
  fileName: string;
  partial: boolean;
  recordCount: number;
};

const parseFileName = (contentDisposition: string | null) => {
  if (!contentDisposition) {
    return '';
  }

  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (!match?.[1]) {
    return '';
  }

  try {
    return decodeURIComponent(match[1].replace(/^"|"$/g, ''));
  } catch {
    return match[1].replace(/^"|"$/g, '');
  }
};

export const requestCsvExport = async (
  accessToken: string,
  params: ExportCsvParams
): Promise<ExportCsvResult> => {
  const response = await fetch(buildExportUrl('exports/csv', params), {
    method: 'GET',
    headers: {
      Accept: 'text/csv,application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const raw = await response.text();

  if (!response.ok) {
    throw createExportError(response.status, raw);
  }

  return {
    csv: raw,
    fileName: parseFileName(response.headers.get('content-disposition')) || `finance-go-${params.scope}.csv`,
    partial: response.headers.get('x-export-partial') === 'true',
    recordCount: Number(response.headers.get('x-export-record-count') ?? '0'),
  };
};

export const requestXlsxExport = async (
  accessToken: string,
  params: ExportCsvParams
): Promise<ExportXlsxResult> => {
  const response = await fetch(buildExportUrl('exports/xlsx', params), {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw createExportError(response.status, await response.text());
  }

  const raw = await response.arrayBuffer();

  return {
    xlsx: new Uint8Array(raw),
    fileName: parseFileName(response.headers.get('content-disposition')) || `finance-go-${params.scope}.xlsx`,
    partial: response.headers.get('x-export-partial') === 'true',
    recordCount: Number(response.headers.get('x-export-record-count') ?? '0'),
  };
};

const buildExportUrl = (path: string, params: ExportCsvParams) => {
  const searchParams = new URLSearchParams();
  searchParams.set('scope', params.scope);

  if (params.month) {
    searchParams.set('month', params.month);
  }

  if (params.startDate) {
    searchParams.set('start_date', params.startDate);
  }

  if (params.endDate) {
    searchParams.set('end_date', params.endDate);
  }

  if (params.language) {
    searchParams.set('lang', params.language);
  }

  return `${buildApiUrl(path)}?${searchParams.toString()}`;
};

const createExportError = (status: number, raw: string) => {
  let message = `Request failed with status ${status}`;
  try {
    const parsed = JSON.parse(raw) as { Message?: string; message?: string };
    message = parsed.Message ?? parsed.message ?? message;
  } catch {
    message = raw || message;
  }

  return new ApiRequestError(status, message, raw);
};
