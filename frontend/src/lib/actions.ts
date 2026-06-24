import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from './api'

export async function forwardMessage(
  messageId: string,
  targetChatIds: string[]
): Promise<{ forwarded: Array<{ chatId: string; message: any }> }> {
  return apiPost('/api/forward', { message_id: messageId, target_chat_ids: targetChatIds })
}

export async function searchInChat(chatId: string, query: string): Promise<any[]> {
  const data = await apiGet<{ messages: any[] }>(`/api/${chatId}/messages?q=${encodeURIComponent(query)}&limit=50`)
  return data.messages || []
}

export async function toggleStar(chatId: string, messageId: string): Promise<{ starred: boolean }> {
  return apiPatch(`/api/${chatId}/messages?messageId=${messageId}`, { action: 'star' })
}

export async function toggleReaction(
  chatId: string,
  messageId: string,
  emoji: string
): Promise<{ added: boolean; emoji: string }> {
  return apiPut(`/api/${chatId}/messages?messageId=${messageId}`, { emoji })
}

export async function updateChatSettings(
  chatId: string,
  action: 'pin' | 'mute' | 'pinMessage',
  value: boolean | string
): Promise<any> {
  return apiPatch(`/api/chats/${chatId}/settings`, { action, value })
}

export async function updateUserSettings(patch: any): Promise<any> {
  return apiPatch('/api/users/me', patch)
}

export async function sendConnectionRequest(toUsername: string): Promise<any> {
  return apiPost('/api/social/connect', { to_username: toUsername })
}

export async function acceptConnection(requestId: string): Promise<any> {
  return apiPost(`/api/social/accept/${requestId}`)
}

export async function declineConnection(requestId: string): Promise<any> {
  return apiPost(`/api/social/decline/${requestId}`)
}

export async function listConnections(): Promise<any> {
  return apiGet('/api/social/connections')
}

export async function listPendingRequests(): Promise<any> {
  return apiGet('/api/social/requests')
}

export async function blockUser(userId: string): Promise<any> {
  return apiPost('/api/social/block', { user_id: userId })
}

export async function unblockUser(userId: string): Promise<any> {
  return apiPost('/api/social/unblock', { user_id: userId })
}

export async function listBlocked(): Promise<any> {
  return apiGet('/api/social/blocked')
}

export async function setNickname(targetUserId: string, nickname: string): Promise<any> {
  return apiPost('/api/social/nickname', { target_user_id: targetUserId, nickname })
}

export async function removeNickname(targetUserId: string): Promise<any> {
  return apiDelete(`/api/social/nickname/${targetUserId}`)
}

export async function listNicknames(): Promise<any> {
  return apiGet('/api/social/nicknames')
}
