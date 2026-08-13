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
