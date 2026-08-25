import { useEffect, useState } from 'react';

type FeedbackCountResponse = {
  total: number;
  countsByCalendarId: Record<string, number>;
};

// Cache em memória do módulo (sobrevive entre navegações de rota dentro da
// mesma sessão do SPA) — evita o badge "zerar e reaparecer" a cada troca de
// página enquanto o fetch novo ainda não respondeu.
let lastKnownCount = 0;
let lastKnownCountsByCalendarId: Record<string, number> = {};

// /api/feedback-count é cacheado no servidor por ~10min e nunca bloqueia
// esperando o Drive (stale-while-revalidate) — ao contrário de /api/feedback
// (TTL de 15s), que resolve o payload completo (mídia, legenda) via Drive
// para cada calendário. Por isso pode ser chamado sem atraso aqui.
function fetchFeedbackCounts(): Promise<FeedbackCountResponse> {
  return fetch('/api/feedback-count', { credentials: 'include' }).then((response) => response.json());
}

export function usePendingFeedbackCount(refreshSignal?: number) {
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(lastKnownCount);

  useEffect(() => {
    fetchFeedbackCounts()
      .then((data) => {
        const count = data.total ?? 0;
        lastKnownCount = count;
        setPendingFeedbackCount(count);
      })
      .catch(() => {});
  }, [refreshSignal]);

  return pendingFeedbackCount;
}

// Cache em memória equivalente ao acima, mas agrupado por calendário — usado
// para exibir o indicador de ajuste pendente no card de cada calendário.
export function usePendingFeedbackByCalendar(refreshSignal?: number) {
  const [countsByCalendarId, setCountsByCalendarId] = useState(lastKnownCountsByCalendarId);

  useEffect(() => {
    fetchFeedbackCounts()
      .then((data) => {
        const counts = data.countsByCalendarId ?? {};
        lastKnownCountsByCalendarId = counts;
        setCountsByCalendarId(counts);
      })
      .catch(() => {});
  }, [refreshSignal]);

  return countsByCalendarId;
}
