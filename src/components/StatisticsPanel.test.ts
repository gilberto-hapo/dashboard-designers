import { describe, expect, it } from 'vitest';

import { getHistoricalMonthProductionTarget } from '@/lib/statisticsTargets';
import type { DesignTask } from '@/lib/data';

function makeTask(overrides: Partial<DesignTask>): DesignTask {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    contentType: 'FEED',
    statusTags: [],
    title: 'Entrega',
    parceiro: overrides.parceiro ?? 'Cliente',
    clienteRelacionado: overrides.clienteRelacionado ?? overrides.parceiro ?? 'Cliente',
    responsavel: 'Ana',
    dataVencimento: overrides.dataVencimento ?? new Date('2026-04-10T12:00:00'),
    stage: overrides.stage ?? 'concluido',
    tempoEstimadoHoras: 1,
    tempoGastoHoras: 1,
    criadoEm: overrides.criadoEm ?? null,
    concluidoEm: overrides.concluidoEm ?? null,
    clienteAtivo: overrides.clienteAtivo ?? true,
    clientePostsMes: overrides.clientePostsMes ?? 10,
    ...overrides,
  };
}

describe('getHistoricalMonthProductionTarget', () => {
  it('uses only tasks from the closed month instead of the current month contract pool', () => {
    const tasks = [
      makeTask({
        id: 'april-client',
        parceiro: 'Cliente abril',
        clientePostsMes: 20,
        criadoEm: new Date('2026-04-05T12:00:00'),
        concluidoEm: new Date('2026-04-15T12:00:00'),
      }),
      makeTask({
        id: 'may-client',
        parceiro: 'Cliente maio',
        clientePostsMes: 100,
        criadoEm: new Date('2026-05-05T12:00:00'),
        dataVencimento: new Date('2026-05-10T12:00:00'),
        concluidoEm: new Date('2026-05-15T12:00:00'),
      }),
    ];

    expect(getHistoricalMonthProductionTarget(tasks, '2026-04')).toBe(30);
  });
});
