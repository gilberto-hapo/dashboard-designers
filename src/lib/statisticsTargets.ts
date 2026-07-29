import type { DesignTask } from './data';
import { getMonthlyProductionTarget } from '@/components/ProductionRhythmPanel';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonthTarget(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

function wasTaskCreatedInMonth(task: DesignTask, targetMonth: string) {
  const createdAt = task.criadoEm;
  return createdAt instanceof Date
    && !Number.isNaN(createdAt.getTime())
    && monthKey(createdAt) === targetMonth;
}

export function getHistoricalMonthProductionTarget(tasks: DesignTask[], targetMonth: string) {
  const target = getMonthlyProductionTarget(tasks.filter((task) => wasTaskCreatedInMonth(task, targetMonth)));
  return target > 0 ? normalizeMonthTarget(target) : null;
}
