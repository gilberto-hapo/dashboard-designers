import { useEffect, useState } from 'react';

// Cache em memória do módulo (sobrevive entre navegações de rota dentro da
// mesma sessão do SPA) — evita o badge "zerar e reaparecer" a cada troca de
// página enquanto o fetch novo ainda não respondeu.
let lastKnownCount = 0;

// Atraso proposital: essa chamada é só para o contador do sino de
// notificações, não é urgente, e faz fan-out pesado no Drive para todos os
// calendários com feedback pendente. Sem esse atraso, ela compete pela mesma
// cota do Google Drive com o carregamento principal da página (ex: abrir um
// calendário específico), o que já causou lentidão perceptível no conteúdo
// que o usuário está de fato esperando ver.
const PENDING_FEEDBACK_FETCH_DELAY_MS = 4000;

export function usePendingFeedbackCount(refreshSignal?: number) {
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(lastKnownCount);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/feedback', { credentials: 'include' })
        .then((response) => response.json())
        .then((responseData) => {
          const count = (responseData.posts ?? []).length;
          lastKnownCount = count;
          setPendingFeedbackCount(count);
        })
        .catch(() => {});
    }, PENDING_FEEDBACK_FETCH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [refreshSignal]);

  return pendingFeedbackCount;
}

// Cache em memória equivalente ao acima, mas agrupado por calendário — usado
// para exibir o indicador de ajuste pendente no card de cada calendário.
let lastKnownCountsByCalendarId: Record<string, number> = {};

export function usePendingFeedbackByCalendar(refreshSignal?: number) {
  const [countsByCalendarId, setCountsByCalendarId] = useState(lastKnownCountsByCalendarId);

  useEffect(() => {
    const timer = setTimeout(() => {
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
    }, PENDING_FEEDBACK_FETCH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [refreshSignal]);

  return countsByCalendarId;
}
