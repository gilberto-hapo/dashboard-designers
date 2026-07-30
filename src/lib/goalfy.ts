import type { AdjustmentEntry, DesignTask } from './data';

export interface GoalfyDataPayload {
  tasks: DesignTask[];
  designers: string[];
  adjustments: AdjustmentEntry[];
  adjustmentCountsByClient: Record<string, number>;
  clients: string[];
}

export interface GoalfyStatisticsPayload {
  tasks: DesignTask[];
  designers: string[];
  adjustments: AdjustmentEntry[];
}

export interface GoalfyRefreshStatus {
  inProgress: boolean;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  error: string;
  cacheUpdatedAt: number;
}

const GOALFY_NETWORK_ERROR_MESSAGE = 'Nao foi possivel conectar ao servidor local da Goalfy. Verifique se o localhost esta ativo e tente novamente.';

interface CachedGoalfyData {
  data: GoalfyDataPayload;
  updatedAt: number;
}

interface CachedGoalfyStatisticsData {
  data: GoalfyStatisticsPayload;
  updatedAt: number;
}

// v13: bump em 2026-07-29 ao trocar a fonte de dados para o board "Posts
// Produção de Conteúdo" — sem chaves antigas na lista de leitura, para que
// o cache velho (outro board) seja ignorado automaticamente, sem o usuário
// precisar limpar localStorage/IndexedDB manualmente.
const GOALFY_CACHE_KEYS = ['hapo-goalfy-data:v14'];
const GOALFY_STATISTICS_CACHE_KEY = 'hapo-goalfy-statistics:v6';
const CACHE_DB_NAME = 'hapo-dashboard-cache';
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'payloads';
const DASHBOARD_CACHE_IDB_KEY = 'goalfy-dashboard:v11';
const STATISTICS_CACHE_IDB_KEY = 'goalfy-statistics:v6';

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

async function readFromIdb<T>(key: string): Promise<T | null> {
  try {
    const db = await openCacheDb();
    return await new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE_NAME, 'readonly');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error || new Error('Failed to read IndexedDB'));
    });
  } catch {
    return null;
  }
}

async function writeToIdb<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to write IndexedDB'));
    });
  } catch {
    // Ignore persistence failures.
  }
}

async function deleteFromIdb(key: string): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to delete IndexedDB entry'));
    });
  } catch {
    // Ignore persistence failures.
  }
}

function normalizeTasks(tasks: DesignTask[]) {
  return (tasks || []).map((task: DesignTask & { dataVencimento: string | Date }) => ({
    ...task,
    responsavelCliente: task.responsavelCliente || task.responsavel,
    designerResponsavel1: task.designerResponsavel1 || task.responsavelCliente || '',
    responsavelHistorico: task.responsavelHistorico || '',
    linkDrive: task.linkDrive || '',
    linkCalendarioEditorial: task.linkCalendarioEditorial || '',
    dataVencimento: new Date(task.dataVencimento),
    criadoEm: task.criadoEm ? new Date(task.criadoEm) : null,
    concluidoEm: task.concluidoEm ? new Date(task.concluidoEm) : null,
    dataNaFaseAtual: task.dataNaFaseAtual ? new Date(task.dataNaFaseAtual) : null,
    entrouExecutandoEm: task.entrouExecutandoEm ? new Date(task.entrouExecutandoEm) : null,
    entrouMontagemEm: task.entrouMontagemEm ? new Date(task.entrouMontagemEm) : null,
    entrouValidacaoEm: task.entrouValidacaoEm ? new Date(task.entrouValidacaoEm) : null,
    tempoValidacaoDias: typeof task.tempoValidacaoDias === 'number' ? task.tempoValidacaoDias : null,
    tempoAprovadoProgramacaoDias: typeof task.tempoAprovadoProgramacaoDias === 'number' ? task.tempoAprovadoProgramacaoDias : null,
    teveAjustes: Boolean(task.teveAjustes),
    registroAjustes: task.registroAjustes || '',
    clienteAtivo: typeof task.clienteAtivo === 'boolean' ? task.clienteAtivo : null,
    clientePostsMes: typeof task.clientePostsMes === 'number' ? task.clientePostsMes : null,
  }));
}

function normalizeAdjustments(adjustments: AdjustmentEntry[]) {
  return (adjustments || []).map((adjustment) => ({
    ...adjustment,
    criadoEm: adjustment.criadoEm ? new Date(adjustment.criadoEm) : null,
    atualizadoEm: adjustment.atualizadoEm ? new Date(adjustment.atualizadoEm) : null,
  }));
}

function normalizeDashboardData(data: {
  tasks: DesignTask[];
  designers: string[];
  adjustments?: AdjustmentEntry[];
  adjustmentCountsByClient?: Record<string, number>;
  clients?: string[];
}): GoalfyDataPayload {
  return {
    tasks: normalizeTasks(data.tasks || []),
    designers: data.designers || [],
    adjustments: normalizeAdjustments(data.adjustments || []),
    adjustmentCountsByClient: data.adjustmentCountsByClient || {},
    clients: data.clients || [],
  };
}

function normalizeStatisticsData(data: {
  tasks: DesignTask[];
  designers: string[];
  adjustments?: AdjustmentEntry[];
}): GoalfyStatisticsPayload {
  return {
    tasks: normalizeTasks(data.tasks || []),
    designers: data.designers || [],
    adjustments: normalizeAdjustments(data.adjustments || []),
  };
}

function normalizeClientKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildAdjustmentCountsByClient(adjustments: AdjustmentEntry[]) {
  return adjustments.reduce<Record<string, number>>((accumulator, adjustment) => {
    if (String(adjustment.tipoEntrega || '').trim().toLowerCase() !== 'ajuste') {
      return accumulator;
    }

    const key = normalizeClientKey(adjustment.cliente);
    if (!key) return accumulator;

    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function buildActiveClientsFromTasks(tasks: DesignTask[]) {
  return [...new Set(
    (tasks || [])
      .filter((task) => task.clienteAtivo === true && typeof task.clientePostsMes === 'number' && task.clientePostsMes > 0)
      .map((task) => String(task.clienteRelacionado || '').trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function getCachedGoalfyDataFromLocalStorage(): CachedGoalfyData | null {
  if (typeof window === 'undefined') return null;

  for (const cacheKey of GOALFY_CACHE_KEYS) {
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as {
        data?: { tasks?: DesignTask[]; designers?: string[]; adjustmentCountsByClient?: Record<string, number> };
        updatedAt?: number;
      };

      if (!parsed?.data || !parsed.updatedAt) continue;

      return {
        data: normalizeDashboardData(parsed.data),
        updatedAt: parsed.updatedAt,
      };
    } catch {
      // Try previous cache key.
    }
  }

  return null;
}

function getCachedGoalfyStatisticsDataFromLocalStorage(): CachedGoalfyStatisticsData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(GOALFY_STATISTICS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      data?: { tasks?: DesignTask[]; designers?: string[]; adjustments?: AdjustmentEntry[] };
      updatedAt?: number;
    };

    if (!parsed?.data || !parsed.updatedAt) return null;

    return {
      data: normalizeStatisticsData(parsed.data),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getCachedGoalfyData(): Promise<CachedGoalfyData | null> {
  const fromIdb = await readFromIdb<CachedGoalfyData>(DASHBOARD_CACHE_IDB_KEY);
  if (fromIdb?.data && fromIdb.updatedAt) {
    return {
      data: normalizeDashboardData(fromIdb.data),
      updatedAt: fromIdb.updatedAt,
    };
  }

  const fromLocalStorage = getCachedGoalfyDataFromLocalStorage();
  if (fromLocalStorage) {
    void writeToIdb(DASHBOARD_CACHE_IDB_KEY, fromLocalStorage);
    return fromLocalStorage;
  }

  return null;
}

export async function getCachedGoalfyStatisticsData(): Promise<CachedGoalfyStatisticsData | null> {
  const fromIdb = await readFromIdb<CachedGoalfyStatisticsData>(STATISTICS_CACHE_IDB_KEY);
  if (fromIdb?.data && fromIdb.updatedAt) {
    return {
      data: normalizeStatisticsData(fromIdb.data),
      updatedAt: fromIdb.updatedAt,
    };
  }

  const fromLocalStorage = getCachedGoalfyStatisticsDataFromLocalStorage();
  if (fromLocalStorage) {
    void writeToIdb(STATISTICS_CACHE_IDB_KEY, fromLocalStorage);
    return fromLocalStorage;
  }

  return null;
}

export function setCachedGoalfyData(data: GoalfyDataPayload, updatedAt = Date.now()) {
  const payload = {
    data,
    updatedAt,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GOALFY_CACHE_KEYS[0], JSON.stringify(payload));
    } catch {
      // Local storage is only a compatibility layer now.
    }
  }

  void writeToIdb(DASHBOARD_CACHE_IDB_KEY, payload);
}

export function setCachedGoalfyStatisticsData(data: GoalfyStatisticsPayload, updatedAt = Date.now()) {
  const payload = {
    data,
    updatedAt,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GOALFY_STATISTICS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Local storage is only a compatibility layer now.
    }
  }

  void writeToIdb(STATISTICS_CACHE_IDB_KEY, payload);
}

export function clearCachedGoalfyData() {
  if (typeof window !== 'undefined') {
    GOALFY_CACHE_KEYS.forEach((cacheKey) => window.localStorage.removeItem(cacheKey));
    window.localStorage.removeItem(GOALFY_STATISTICS_CACHE_KEY);
  }

  void deleteFromIdb(DASHBOARD_CACHE_IDB_KEY);
  void deleteFromIdb(STATISTICS_CACHE_IDB_KEY);
}

function normalizeGoalfyRequestError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    const message = String(error.message || '').trim();
    const normalizedMessage = message.toLowerCase();

    if (
      normalizedMessage === 'failed to fetch'
      || normalizedMessage.includes('fetch failed')
      || normalizedMessage.includes('networkerror')
      || normalizedMessage.includes('load failed')
    ) {
      return new Error(GOALFY_NETWORK_ERROR_MESSAGE);
    }

    if (normalizedMessage.includes('signal timed out') || normalizedMessage.includes('timeout')) {
      return new Error('A atualizacao da Goalfy demorou mais do que o esperado. Tente novamente em instantes.');
    }

    return error;
  }

  return new Error(fallbackMessage);
}

export async function fetchGoalfyData(forceRefresh = false): Promise<GoalfyDataPayload> {
  try {
    const response = await fetch(`/api/goalfy-data${forceRefresh ? '?refresh=1' : ''}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(forceRefresh ? 240000 : 180000),
    });

    if (!response.ok) {
      const message = response.status === 401
        ? 'Sessao expirada. Faca login novamente.'
        : `Goalfy API error: ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    const normalizedData = normalizeDashboardData(data);
    setCachedGoalfyData(normalizedData);
    return normalizedData;
  } catch (error) {
    throw normalizeGoalfyRequestError(error, 'Falha ao carregar dados da Goalfy.');
  }
}

export async function fetchGoalfyStatisticsData(): Promise<GoalfyStatisticsPayload> {
  const response = await fetch('/api/goalfy-statistics-data', {
    credentials: 'include',
    signal: AbortSignal.timeout(180000),
  });

  if (!response.ok) {
    const message = response.status === 401
      ? 'Sessao expirada. Faca login novamente.'
      : `Goalfy Statistics API error: ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  const normalizedData = normalizeStatisticsData(data);
  setCachedGoalfyStatisticsData(normalizedData);
  return normalizedData;
}

export async function triggerGoalfyRefresh(): Promise<{
  started: boolean;
  immediate: boolean;
  status: GoalfyRefreshStatus;
  data?: GoalfyDataPayload;
}> {
  try {
    const response = await fetch('/api/goalfy-refresh', {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const message = response.status === 401
        ? 'Sessao expirada. Faca login novamente.'
        : `Goalfy refresh trigger error: ${response.status}`;
      throw new Error(message);
    }

    const result = await response.json();
    const data = result?.data ? normalizeDashboardData(result.data) : undefined;
    if (data) {
      setCachedGoalfyData(data, Number(result?.status?.cacheUpdatedAt) || Date.now());
    }

    return {
      started: Boolean(result?.started),
      immediate: Boolean(result?.immediate),
      status: {
        inProgress: Boolean(result?.status?.inProgress),
        startedAt: Number(result?.status?.startedAt) || 0,
        completedAt: Number(result?.status?.completedAt) || 0,
        durationMs: Number(result?.status?.durationMs) || 0,
        error: String(result?.status?.error || ''),
        cacheUpdatedAt: Number(result?.status?.cacheUpdatedAt) || 0,
      },
      data,
    };
  } catch (error) {
    throw normalizeGoalfyRequestError(error, 'Falha ao iniciar a atualizacao da Goalfy.');
  }
}

export async function fetchGoalfyRefreshStatus(): Promise<GoalfyRefreshStatus> {
  try {
    const response = await fetch('/api/goalfy-refresh-status', {
      credentials: 'include',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const message = response.status === 401
        ? 'Sessao expirada. Faca login novamente.'
        : `Goalfy refresh status error: ${response.status}`;
      throw new Error(message);
    }

    const result = await response.json();
    return {
      inProgress: Boolean(result?.inProgress),
      startedAt: Number(result?.startedAt) || 0,
      completedAt: Number(result?.completedAt) || 0,
      durationMs: Number(result?.durationMs) || 0,
      error: String(result?.error || ''),
      cacheUpdatedAt: Number(result?.cacheUpdatedAt) || 0,
    };
  } catch (error) {
    throw normalizeGoalfyRequestError(error, 'Falha ao consultar o status da atualizacao da Goalfy.');
  }
}
