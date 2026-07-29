import { describe, expect, it } from 'vitest';

import { computeInsights } from '@/lib/insights';
import type { DesignTask } from '@/lib/data';

function makeDate(daysFromToday: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date;
}

function makeTask(overrides: Partial<DesignTask>): DesignTask {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    contentType: 'FEED',
    statusTags: [],
    title: overrides.title ?? 'Entrega',
    parceiro: overrides.parceiro ?? 'Cliente ativo',
    clienteRelacionado: overrides.clienteRelacionado ?? overrides.parceiro ?? 'Cliente ativo',
    responsavel: overrides.responsavel ?? 'Ana',
    responsavelCliente: overrides.responsavelCliente ?? overrides.responsavel ?? 'Ana',
    designerResponsavel1: overrides.designerResponsavel1 ?? overrides.responsavel ?? 'Ana',
    dataVencimento: overrides.dataVencimento ?? makeDate(1),
    stage: overrides.stage ?? 'fazer',
    tempoEstimadoHoras: 3,
    tempoGastoHoras: 0,
    criadoEm: overrides.criadoEm ?? makeDate(-1),
    concluidoEm: overrides.concluidoEm ?? null,
    dataNaFaseAtual: null,
    entrouExecutandoEm: null,
    entrouMontagemEm: null,
    entrouValidacaoEm: null,
    tempoValidacaoDias: null,
    tempoAprovadoProgramacaoDias: null,
    teveAjustes: false,
    registroAjustes: '',
    clienteAtivo: overrides.clienteAtivo ?? true,
    clientePostsMes: overrides.clientePostsMes ?? 10,
    ...overrides,
  };
}

describe('computeInsights production front goal', () => {
  it('ignores inactive clients when calculating designer front and daily goal', () => {
    const tasks = [
      makeTask({
        id: 'active-front',
        parceiro: 'Cliente ativo',
        clienteAtivo: true,
        clientePostsMes: 10,
      }),
      ...Array.from({ length: 12 }, (_, index) => makeTask({
        id: `inactive-front-${index}`,
        parceiro: 'Cliente desativado',
        clienteRelacionado: 'Cliente desativado',
        clienteAtivo: false,
        clientePostsMes: 40,
      })),
      ...Array.from({ length: 12 }, (_, index) => makeTask({
        id: `inactive-done-${index}`,
        parceiro: 'Cliente desativado',
        clienteRelacionado: 'Cliente desativado',
        clienteAtivo: false,
        clientePostsMes: 40,
        stage: 'concluido',
        concluidoEm: makeDate(-1),
      })),
    ];

    const insights = computeInsights(tasks, ['Ana']);
    const ana = insights.porDesigner.find((designer) => designer.nome === 'Ana');

    expect(ana?.frente.totalProximas2Semanas).toBe(1);
    expect(ana?.frente.pendentes).toBe(1);
    expect(ana?.frente.tarefasPendentes.map((task) => task.id)).toEqual(['active-front']);
    expect(ana?.frente.metaDiaria).toBeLessThan(6);
  });
});
