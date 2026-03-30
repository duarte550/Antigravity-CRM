import { useState, useEffect, useCallback } from 'react';
import { Page } from '../types';

// ─── URL ↔ Page mapping ───────────────────────────────────────────────────────
export const PAGE_TO_PATH: Record<Page, string> = {
  [Page.OVERVIEW]: '/',
  [Page.DETAIL]: '/operacao',
  [Page.TASKS]: '/tarefas',
  [Page.CREDIT_REVIEWS]: '/revisoes',
  [Page.AUDIT_LOG]: '/audit-log',
  [Page.WATCHLIST]: '/watchlist',
  [Page.ANALYST_HUB]: '/analyst-hub',
  [Page.CHANGE_LOG]: '/changelog',
  [Page.LEGACY]: '/legado',
  [Page.SYNC_QUEUE]: '/sync-queue',
  [Page.MASTER_GROUPS]: '/master-groups',
  [Page.MASTER_GROUP_DETAIL]: '/master-group',
  [Page.ECONOMIC_GROUPS]: '/economic-groups',
  [Page.ECONOMIC_GROUP_DETAIL]: '/economic-group',
  [Page.ORIGINATION_PIPELINE]: '/originacao',
  [Page.STRUCTURING_OPERATION_DETAIL]: '/structuring-operation',
  [Page.CARTEIRA_COMPLETA]: '/carteira',
  [Page.COMITES]: '/comites',
  [Page.COMITE_DETAIL]: '/comite',
  [Page.COMITE_VIDEO]: '/comite-video',
  [Page.COMITE_ITEM_PAUTA]: '/comite-item',
  [Page.COMITE_PROXIMOS_PASSOS]: '/comite-proximos-passos',
  [Page.MINHAS_APROVACOES]: '/minhas-aprovacoes',
};

const PATH_TO_PAGE: Record<string, Page> = Object.fromEntries(
  Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page as Page])
) as Record<string, Page>;

export const buildUrl = (page: Page, id?: number): string => {
  const base = PAGE_TO_PATH[page] || '/';
  return id ? `${base}/${id}` : base;
};

export const parseUrl = (pathname: string): { page: Page; id?: number } => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (PATH_TO_PAGE[clean]) return { page: PATH_TO_PAGE[clean] };
  const match = clean.match(/^(\/[\w-]+)\/([\d]+)$/);
  if (match && PATH_TO_PAGE[match[1]]) {
    return { page: PATH_TO_PAGE[match[1]], id: parseInt(match[2]) };
  }
  return { page: Page.OVERVIEW };
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseNavigationReturn {
  currentPage: Page;
  selectedOperationId: number | null;
  navigate: (page: Page, operationId?: number) => void;
}

export function useNavigation(): UseNavigationReturn {
  const [currentPage, setCurrentPage] = useState<Page>(
    () => parseUrl(window.location.pathname).page
  );
  const [selectedOperationId, setSelectedOperationId] = useState<number | null>(() => {
    const { id } = parseUrl(window.location.pathname);
    return id ?? null;
  });

  // Sync state on browser back/forward — no data fetching here; App.tsx handles that
  useEffect(() => {
    const handlePopState = () => {
      const { page, id } = parseUrl(window.location.pathname);
      setCurrentPage(page);
      setSelectedOperationId(id ?? null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((page: Page, operationId?: number) => {
    setCurrentPage(page);
    setSelectedOperationId(operationId ?? null);
    const url = buildUrl(page, operationId);
    if (window.location.pathname !== url) {
      window.history.pushState({ page, operationId }, '', url);
    }
  }, []);

  return { currentPage, selectedOperationId, navigate };
}
