import { buildApiUrl } from '@/constants/api';
import { ApiRequestError, request } from '@/lib/api/client';

export type AnalysisResponse = {
  reply: string;
};

export type UsageInfo = {
  chat_count: number;
  max_chats: number;
};

export type ChatContext = {
  salary_day?: number;
  period_start?: string;
  period_end?: string;
  period_mode?: string;
};

export const sendChatMessage = async (
  accessToken: string,
  message: string,
  context?: ChatContext
): Promise<AnalysisResponse> => {
  const payload = await request<{ Data: AnalysisResponse }>(buildApiUrl('ai/chat'), {
    method: 'POST',
    token: accessToken,
    body: { message, context },
  });
  return payload.Data;
};

export const getChatUsage = async (accessToken: string): Promise<UsageInfo> => {
  const payload = await request<{ Data: UsageInfo }>(buildApiUrl('ai/usage'), {
    method: 'GET',
    token: accessToken,
  });
  return payload.Data;
};

export { ApiRequestError };

