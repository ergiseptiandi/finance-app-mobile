import { request, ApiRequestError } from '@/lib/api/client';
import { buildApiUrl } from '@/constants/api';

export type AnalysisResponse = {
  reply: string;
};

export type UsageInfo = {
  chat_count: number;
  max_chats: number;
};

export const sendChatMessage = async (accessToken: string, message: string): Promise<AnalysisResponse> => {
  const payload = await request<{ Data: AnalysisResponse }>(buildApiUrl('ai/chat'), {
    method: 'POST',
    token: accessToken,
    body: { message },
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
