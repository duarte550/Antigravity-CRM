export const fetchApi = (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  return fetch(url, {
    ...init,
    credentials: 'include', // Sending credentials automatically
  });
};

const API_BASE = import.meta.env.VITE_API_URL || 'https://antigravity-crm-two.vercel.app';

/**
 * Dispara a criação automática de um item de revisão na pauta do próximo
 * comitê de INVESTIMENTO da mesma área da operação.
 * Fire-and-forget: não bloqueia a UI.
 */
export const autoCreateComiteReviewItem = (params: {
  operationId: number;
  operationName: string;
  operationArea: string;
  reviewTitle: string;
  reviewDescription: string;
  analystName: string;
  videoUrl: string;
  watchlist: string;
  ratingOperation: string;
  sentiment: string;
}): void => {
  fetchApi(`${API_BASE}/api/comite/auto-review-item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation_id: params.operationId,
      operation_name: params.operationName,
      operation_area: params.operationArea,
      review_title: params.reviewTitle,
      review_description: params.reviewDescription,
      analyst_name: params.analystName,
      video_url: params.videoUrl,
      watchlist: params.watchlist,
      rating_operation: params.ratingOperation,
      sentiment: params.sentiment,
    }),
  }).then(res => {
    if (res.ok) return res.json();
    throw new Error('Falha ao criar item no comitê');
  }).then(result => {
    if (result?.status === 'created') {
      console.log('[AutoReview] Item de revisão criado no comitê:', result.comite_id);
    }
  }).catch(err => {
    console.error('[AutoReview] Error auto-creating review item:', err);
  });
};
