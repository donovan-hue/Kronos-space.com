import { api } from "./apiClient";

export async function getChannels({ orbitId } = {}) {
  const { data } = await api.get("/channels", { params: orbitId ? { orbitId } : undefined });
  return data?.channels || [];
}

export async function getChannel(channelId) {
  const { data } = await api.get(`/channels/${channelId}`);
  return data?.channel;
}

export async function createChannel(payload) {
  const { data } = await api.post("/channels", payload);
  return data?.channel;
}

export async function subscribeChannel(channelId) {
  const { data } = await api.post(`/channels/${channelId}/subscribe`);
  return data?.channel;
}

export async function unsubscribeChannel(channelId) {
  const { data } = await api.delete(`/channels/${channelId}/subscribe`);
  return data?.channel;
}

export async function getChannelMessages(channelId, { page = 1, limit = 30 } = {}) {
  const { data } = await api.get(`/channels/${channelId}/messages`, { params: { page, limit } });
  return data;
}

export async function sendChannelMessage(channelId, text) {
  const { data } = await api.post(`/channels/${channelId}/messages`, { text });
  return data?.message;
}
