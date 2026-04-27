import { buildApiUrl } from '@/constants/api';
import { ApiRequestError } from '@/lib/api/client';

export type ExportScope = 'transactions' | 'debts' | 'reports';
export type ExportPeriodMode = 'month' | 'custom';

export type ExportCsvParams = {
  scope: ExportScope;
  month?: string;
  startDate?: string;
  endDate?: string;
};

export type ExportCsvResult = {
  csv: string;
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

  const response = await fetch(`${buildApiUrl('exports/csv')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'text/csv,application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const raw = await response.text();

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { Message?: string; message?: string };
      message = parsed.Message ?? parsed.message ?? message;
    } catch {
      message = raw || message;
    }

    throw new ApiRequestError(response.status, message, raw);
  }

  return {
    csv: raw,
    fileName: parseFileName(response.headers.get('content-disposition')) || `finance-go-${params.scope}.csv`,
    partial: response.headers.get('x-export-partial') === 'true',
    recordCount: Number(response.headers.get('x-export-record-count') ?? '0'),
  };
};
