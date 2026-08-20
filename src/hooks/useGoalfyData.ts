import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchGoalfyData,
  fetchGoalfyRefreshStatus,
  getCachedGoalfyData,
  triggerGoalfyRefresh,
  type GoalfyDataPayload,
} from '@/lib/goalfy';
import { computeInsights, type DashboardInsights } from '@/lib/insights';
import { useAuth } from '@/lib/auth';

const REFRESH_POLL_INTERVAL_MS = 2500;
const REFRESH_POLL_MAX_ATTEMPTS = 36;
// 3 minutos, nao 30s: cada tick reconsulta o banco Postgres gerenciado (via
// /api/feedback -> getLatestDecisionsForCalendars, alem de resolver posts do
// Drive para calendarios com feedback pendente) -- com varias pessoas com o
// dashboard aberto ao mesmo tempo, um intervalo curto gera carga desnecessaria.
const AUTO_REFRESH_INTERVAL_MS = 180_000;

export function useGoalfyData() {
  const [data, setData] = useState<GoalfyDataPayload | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(0);
  const [isFetching, setIsFetching] = useState(false);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [lastGoalfySyncCompletedAt, setLastGoalfySyncCompletedAt] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(true);
  const lastLoginAt = useAuth((state) => state.lastLoginAt);
  const isAuthenticated = useAuth((state) => state.isAuthenticated);
  const isAuthLoading = useAuth((state) => state.isLoading);

  const applyData = (nextData: GoalfyDataPayload) => {
    setData(nextData);
    setLastUpdatedAt(Date.now());
    setError(null);
  };

  const waitForBackgroundRefresh = async (startedAt: number) => {
    let appliedCacheUpdatedAt = 0;

    for (let attempt = 0; attempt < REFRESH_POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, REFRESH_POLL_INTERVAL_MS));
      const status = await fetchGoalfyRefreshStatus();

      if (status.cacheUpdatedAt >= startedAt && status.cacheUpdatedAt > appliedCacheUpdatedAt) {
        const nextData = await fetchGoalfyData(false);
        applyData(nextData);
        appliedCacheUpdatedAt = status.cacheUpdatedAt;
        setLastGoalfySyncCompletedAt(status.cacheUpdatedAt || Date.now());
      }

      if (status.inProgress) {
        continue;
      }

      if (status.error) {
        throw new Error(status.error);
      }

      if (status.completedAt >= startedAt) {
        if (status.completedAt > appliedCacheUpdatedAt) {
          const nextData = await fetchGoalfyData(false);
          applyData(nextData);
        }
        setLastGoalfySyncCompletedAt(status.completedAt || Date.now());
      }

      return;
    }

    throw new Error('A sincronizacao da Goalfy ainda nao terminou. Tente novamente em instantes.');
  };

  const refetch = async () => {
    if (isBackgroundSyncing) {
      return data;
    }

    setIsFetching(true);
    try {
      if (!data) {
        const nextData = await fetchGoalfyData(false);
        applyData(nextData);
        setLastGoalfySyncCompletedAt(Date.now());
        return nextData;
      }

      const refreshResult = await triggerGoalfyRefresh();

      if (refreshResult.data) {
        applyData(refreshResult.data);
        if (refreshResult.status.cacheUpdatedAt > 0) {
          setLastGoalfySyncCompletedAt(refreshResult.status.cacheUpdatedAt);
        }
      }

      if (refreshResult.status.startedAt > 0) {
        setIsBackgroundSyncing(true);
        void waitForBackgroundRefresh(refreshResult.status.startedAt).catch((nextError) => {
          const normalizedError = nextError instanceof Error
            ? nextError
            : new Error('Falha ao finalizar a atualizacao em segundo plano da Goalfy.');
          setError(normalizedError);
        }).finally(() => {
          setIsBackgroundSyncing(false);
        });
      }

      return data;
    } catch (nextError) {
      const normalizedError = nextError instanceof Error ? nextError : new Error('Falha ao atualizar dados da Goalfy.');
      if (!data) {
        setError(normalizedError);
      }
      throw normalizedError;
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const hydrateCache = async () => {
      const cachedData = await getCachedGoalfyData();
      if (!isActive) return;

      if (cachedData) {
        setData(cachedData.data);
        setLastUpdatedAt(cachedData.updatedAt);
      }

      setIsCacheLoading(false);
    };

    void hydrateCache();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!lastLoginAt) {
      return;
    }

    let isActive = true;

    const hydrateAfterLogin = async () => {
      const cachedData = await getCachedGoalfyData();
      if (!isActive) return;

      if (cachedData) {
        setData(cachedData.data);
        setLastUpdatedAt(cachedData.updatedAt);
        setError(null);
      }

      void refetch();
    };

    void hydrateAfterLogin();

    return () => {
      isActive = false;
    };
  }, [lastLoginAt]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated) {
      setData(null);
      setLastUpdatedAt(0);
      setLastGoalfySyncCompletedAt(0);
      setError(null);
      setIsBackgroundSyncing(false);
    }
  }, [isAuthenticated, isAuthLoading]);

  const hasAttemptedHydrateMissingClientsRef = useRef(false);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || isCacheLoading || isFetching || isBackgroundSyncing) {
      return;
    }

    const hasClients = Boolean(data && data.clients.length > 0);
    const hasDriveLinks = Boolean(data && data.tasks.some((task) => Boolean(String(task.linkDrive || '').trim())));

    if (hasClients && hasDriveLinks) {
      return;
    }

    // Sem isso, dados legitimamente incompletos (ex: nenhuma task tem
    // linkDrive preenchido ainda) fariam este efeito rodar em loop infinito
    // a cada applyData — já causou queda de produção por esgotar o servidor
    // com requisições repetidas em looping (ver git blame/incidente).
    if (hasAttemptedHydrateMissingClientsRef.current) {
      return;
    }
    hasAttemptedHydrateMissingClientsRef.current = true;

    let isActive = true;

    const hydrateMissingClients = async () => {
      try {
        const nextData = await fetchGoalfyData(false);
        if (!isActive) return;
        applyData(nextData);
      } catch (nextError) {
        if (!isActive) return;
        const normalizedError = nextError instanceof Error ? nextError : new Error('Falha ao carregar dados da Goalfy.');
        setError(normalizedError);
      }
    };

    void hydrateMissingClients();

    return () => {
      isActive = false;
    };
  }, [data, isAuthLoading, isAuthenticated, isBackgroundSyncing, isCacheLoading, isFetching]);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.hidden || isFetching || isBackgroundSyncing) {
        return;
      }

      fetchGoalfyData(false)
        .then((nextData) => {
          applyData(nextData);
        })
        .catch(() => {
          // Falha silenciosa: mantem os dados atuais em tela, o proximo tick tenta de novo.
        });
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAuthLoading, isAuthenticated, isFetching, isBackgroundSyncing]);

  const insights: DashboardInsights | null = useMemo(() => {
    if (!data) {
      return null;
    }

    return computeInsights(data.tasks, data.designers, data.adjustmentCountsByClient, data.adjustments);
  }, [data]);

  return {
    data,
    insights,
    hasData: Boolean(data),
    isLoading: isCacheLoading,
    isFetching,
    isBackgroundSyncing,
    isError: Boolean(error),
    error,
    lastUpdatedAt,
    lastGoalfySyncCompletedAt,
    refetch,
  };
}
