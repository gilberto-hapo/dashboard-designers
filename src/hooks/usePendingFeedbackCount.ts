import { useEffect, useState } from 'react';

// Cache em memória do módulo (sobrevive entre navegações de rota dentro da
// mesma sessão do SPA) — evita o badge "zerar e reaparecer" a cada troca de
// página enquanto o fetch novo ainda não respondeu.
let lastKnownCount = 0;

export function usePendingFeedbackCount(refreshSignal?: number) {
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(lastKnownCount);

  useEffect(() => {
    fetch('/api/feedback', { credentials: 'include' })
      .then((response) => response.json())
      .then((responseData) => {
        const count = (responseData.posts ?? []).length;
        lastKnownCount = count;
        setPendingFeedbackCount(count);
      })
      .catch(() => {});
  }, [refreshSignal]);

  return pendingFeedbackCount;
}

// Cache em memória equivalente ao acima, mas agrupado por calendário — usado
// para exibir o indicador de ajuste pendente no card de cada calendário.
let lastKnownCountsByCalendarId: Record<string, number> = {};

export function usePendingFeedbackByCalendar(refreshSignal?: number) {
  const [countsByCalendarId, setCountsByCalendarId] = useState(lastKnownCountsByCalendarId);

  useEffect(() => {
    fetch('/api/feedback', { credentials: 'include' })
      .then((response) => response.json())
      .then((responseData) => {
        const counts: Record<string, number> = {};
        (responseData.posts ?? []).forEach((post: { calendarId: string }) => {
          counts[post.calendarId] = (counts[post.calendarId] ?? 0) + 1;
        });
        lastKnownCountsByCalendarId = counts;
        setCountsByCalendarId(counts);
      })
      .catch(() => {});
  }, [refreshSignal]);

  return countsByCalendarId;
}
