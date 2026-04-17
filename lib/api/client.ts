type ErrorEnvelope = {
  Status?: string;
  Message?: string;
};

export class ApiRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

export type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  token?: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isErrorEnvelope = (value: unknown): value is ErrorEnvelope =>
  isObject(value) && typeof value.Message === 'string';

const parseResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  if (contentType.includes('application/json') || raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }

  return raw;
};

export const request = async <T>(url: string, options: RequestOptions = {}) => {
  const { token, body, headers: optionHeaders, ...rest } = options;
  const headers = new Headers(optionHeaders);
  headers.set('Accept', 'application/json');

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    headers.set('Authorization', bearerToken);
  }

  const response = await fetch(url, {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const message = isErrorEnvelope(payload)
      ? payload.Message
      : `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, message, payload);
  }

  return payload as T;
};
