export const fetchApi = (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  return fetch(url, {
    ...init,
    credentials: 'include', // Sending credentials automatically
  });
};
