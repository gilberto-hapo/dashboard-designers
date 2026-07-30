import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'hapo_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const GOALFY_FETCH_TIMEOUT_MS = 180000;
const GOALFY_CACHE_TTL_MS = 1000 * 60 * 5;
const GOALFY_BOARD_CACHE_TTL_MS = 1000 * 60 * 5;
const GOALFY_CLIENTS_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const GOALFY_ADJUSTMENTS_CACHE_TTL_MS = 1000 * 60 * 15;
const AI_RECOMMENDATIONS_TTL_MS = 1000 * 60 * 15;
const GOALFY_PERSISTENCE_DIR = path.join(__dirname, 'data');
const GOALFY_PERSISTENCE_FILE = path.join(GOALFY_PERSISTENCE_DIR, 'goalfy-cache.json');
const GOALFY_REPO_SNAPSHOT_FILE = path.join(__dirname, 'public', 'goalfy-cache-seed.json');
const AI_REQUEST_TIMEOUT_MS = 15000;
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1/chat/completions';

const app = express();
let cachedGoalfyData = null;
let cachedGoalfyDataAt = 0;
let inflightGoalfyDataPromise = null;
let cachedGoalfyBoard = null;
let cachedGoalfyBoardAt = 0;
let inflightGoalfyBoardPromise = null;
let cachedGoalfyBoardTaskSnapshot = new Map();
let cachedClientDesignerMap = null;
let cachedClientDesignerMapAt = 0;
let inflightClientDesignerMapPromise = null;
let cachedGoalfyAdjustments = null;
let cachedGoalfyAdjustmentsAt = 0;
let inflightGoalfyAdjustmentsPromise = null;
let cachedCalendarLinksMap = null;
let cachedCalendarLinksMapAt = 0;
let inflightCalendarLinksMapPromise = null;
let inflightBackgroundRefreshPromise = null;
let goalfyRefreshState = {
  inProgress: false,
  startedAt: 0,
  completedAt: 0,
  durationMs: 0,
  error: '',
};
const aiRecommendationsCache = new Map();

app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET || 'change-me-in-production'));

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAuthUsers() {
  const raw = getRequiredEnv('AUTH_USERS_JSON');
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    const normalized = raw
      .trim()
      .replace(/^"(.*)"$/s, '$1')
      .replace(/\\(["{}[\]])/g, '$1');

    parsed = JSON.parse(normalized);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AUTH_USERS_JSON must be a non-empty array');
  }

  return parsed.map((user) => ({
    username: user.username ? String(user.username).trim() : '',
    email: String(user.email || '').trim(),
    password: String(user.password || ''),
    name: String(user.name || '').trim(),
    role: user.role === 'designer' ? 'designer' : 'admin',
    designerName: user.designerName ? String(user.designerName).trim() : undefined,
  }));
}

function logServerEvent(message, details = {}) {
  console.log(message, JSON.stringify(details));
}

function nowMs() {
  return Date.now();
}

function getDurationMs(startedAt) {
  return nowMs() - startedAt;
}

function shouldUseCache(cachedValue, cachedAt, ttlMs) {
  return Boolean(cachedValue) && nowMs() - cachedAt < ttlMs;
}

function reviveGoalfyTask(task) {
  if (!task || typeof task !== 'object') return null;

  return {
    ...task,
    dataVencimento: task.dataVencimento ? new Date(task.dataVencimento) : new Date(),
    criadoEm: task.criadoEm ? new Date(task.criadoEm) : null,
    concluidoEm: task.concluidoEm ? new Date(task.concluidoEm) : null,
    dataNaFaseAtual: task.dataNaFaseAtual ? new Date(task.dataNaFaseAtual) : null,
    entrouValidacaoEm: task.entrouValidacaoEm ? new Date(task.entrouValidacaoEm) : null,
  };
}

function reviveGoalfyAdjustment(adjustment) {
  if (!adjustment || typeof adjustment !== 'object') return null;

  return {
    ...adjustment,
    criadoEm: adjustment.criadoEm ? new Date(adjustment.criadoEm) : null,
    atualizadoEm: adjustment.atualizadoEm ? new Date(adjustment.atualizadoEm) : null,
  };
}

function reviveGoalfyData(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const tasks = Array.isArray(payload.tasks) ? payload.tasks.map(reviveGoalfyTask).filter(Boolean) : [];
  const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments.map(reviveGoalfyAdjustment).filter(Boolean) : [];
  const designers = Array.isArray(payload.designers) ? payload.designers.map((value) => String(value)) : [];
  const clients = Array.isArray(payload.clients) ? payload.clients.map((value) => String(value)) : [];

  if (tasks.length === 0 && adjustments.length === 0 && designers.length === 0 && clients.length === 0) {
    return null;
  }

  return {
    tasks,
    designers,
    adjustments,
    clients,
  };
}

async function readPersistedGoalfyData() {
  const sourceFiles = [GOALFY_PERSISTENCE_FILE, GOALFY_REPO_SNAPSHOT_FILE];

  for (const sourceFile of sourceFiles) {
    try {
      const raw = await fs.readFile(sourceFile, 'utf8');
      const parsed = JSON.parse(raw);
      const data = reviveGoalfyData(parsed?.data);
      const updatedAt = Number(parsed?.updatedAt) || 0;

      if (!data || !updatedAt) {
        continue;
      }

      return { data, updatedAt };
    } catch {
      // try next source
    }
  }

  return null;
}

async function persistGoalfyData(data, updatedAt = Date.now()) {
  const payload = JSON.stringify(
    {
      updatedAt,
      data,
    },
    null,
    2,
  );

  const writeCacheFile = async (targetFile) => {
    const targetDir = path.dirname(targetFile);
    await fs.mkdir(targetDir, { recursive: true });
    const tempFile = `${targetFile}.tmp`;
    await fs.writeFile(tempFile, payload, 'utf8');
    await fs.rm(targetFile, { force: true });
    await fs.rename(tempFile, targetFile);
  };

  try {
    await writeCacheFile(GOALFY_PERSISTENCE_FILE);
    await writeCacheFile(GOALFY_REPO_SNAPSHOT_FILE);
  } catch (error) {
    console.error('Failed to persist Goalfy cache', error);
  }
}

function getGoalfyRefreshStatus() {
  return {
    inProgress: goalfyRefreshState.inProgress,
    startedAt: goalfyRefreshState.startedAt,
    completedAt: goalfyRefreshState.completedAt,
    durationMs: goalfyRefreshState.durationMs,
    error: goalfyRefreshState.error,
    cacheUpdatedAt: cachedGoalfyDataAt,
  };
}

function sanitizeUser(user) {
  return {
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    designerName: user.designerName,
  };
}

function createSessionToken(user) {
  const secret = getRequiredEnv('SESSION_SECRET');
  const payload = {
    user: sanitizeUser(user),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token) {
  const secret = getRequiredEnv('SESSION_SECRET');
  const [encodedPayload, signature] = String(token || '').split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

  if (!payload?.user || !payload?.exp || payload.exp < Date.now()) {
    return null;
  }

  return payload.user;
}

function getSessionUser(req) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.user = user;
  next();
}

// Atualizado em 2026-07-29 para o board "Posts Produção de Conteúdo"
// (boardId e9d22a5a-8263-41da-9784-3e77589e8469), que tem fases diferentes
// do board anterior. "Criação textual"/"Criação das artes" mapeiam para
// fazer/executando (mesmas 2 primeiras colunas do fluxo anterior);
// "Post Programado" e "Arquivado" mapeiam para concluido.
const stageMap = {
  'criacao textual': 'fazer',
  'criacao das artes': 'executando',
  'direcao de arte': 'direcao_arte',
  'montagem da apresentacao': 'montagem',
  'validacao do cliente': 'validacao',
  'aprovado para programacao': 'aprovado_programacao',
  'post programado': 'concluido',
  arquivado: 'concluido',
};

function parseContentType(tags) {
  const normalizedTags = normalizeLookupKey(tags).toUpperCase();
  if (!normalizedTags) return 'FEED';
  if (normalizedTags.includes('REELS')) return 'REELS';
  if (normalizedTags.includes('STORY')) return 'STORY';
  return 'FEED';
}

function parseStatusTags(tags) {
  if (!tags) return [];

  const normalizedTags = normalizeLookupKey(tags).toUpperCase();
  const parsed = [];
  if (normalizedTags.includes('CORRECAO')) parsed.push('CORREÇÃO');
  if (normalizedTags.includes('AGUARDANDO MATERIAL')) parsed.push('AGUARDANDO MATERIAL');
  if (normalizedTags.includes('AGUARDANDO FEEDBACK')) parsed.push('AGUARDANDO FEEDBACK');
  if (normalizedTags.includes('APROVADO')) parsed.push('APROVADO');
  if (normalizedTags.includes('CORRIGIDO')) parsed.push('CORRIGIDO');
  if (normalizedTags.includes('DATA COMEMORATIVA')) parsed.push('DATA COMEMORATIVA');
  return parsed;
}

function parseDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;

  const text = String(value);
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 8, 0);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseOptionalDate(value) {
  if (!value) return null;
  const parsed = parseDate(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDesignerName(name) {
  if (!name) return 'Sem designer';
  const normalized = String(name).trim();
  const parts = normalized
    .split(/[;,/]+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return 'Sem designer';
  }

  return parts.join(', ');
}

function collectDesignerNames(tasks = [], clientDesignerMap = null) {
  const names = new Set();

  const registerDesigner = (value) => {
    const normalized = normalizeDesignerName(value);
    normalized
      .split(/[;,/]+/)
      .map((item) => item.trim())
      .filter((item) => item && item !== 'Sem designer')
      .forEach((item) => names.add(item));
  };

  if (clientDesignerMap) {
    const seenClients = new Set();

    for (const clientMeta of clientDesignerMap.values()) {
      const clientKey = normalizeLookupKey(clientMeta?.clientName);
      if (!clientKey || seenClients.has(clientKey)) {
        continue;
      }

      seenClients.add(clientKey);

      const hasActiveClient = clientMeta?.ativo === true;
      const hasProductionContract =
        typeof clientMeta?.postsPerMonth === 'number'
        && Number.isFinite(clientMeta.postsPerMonth)
        && clientMeta.postsPerMonth > 0;

      if (hasActiveClient && hasProductionContract) {
        registerDesigner(clientMeta.designer);
      }
    }
  }

  for (const task of tasks) {
    const hasActiveClient = task?.clienteAtivo === true;
    const hasProductionContract = typeof task?.clientePostsMes === 'number' && task.clientePostsMes > 0;

    if (!hasActiveClient || !hasProductionContract) {
      continue;
    }

    registerDesigner(task.responsavelCliente || task.designerResponsavel1 || task.responsavel);
  }

  return [...names].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function collectActiveClientNames(tasks = [], clientDesignerMap = null) {
  const clients = new Map();

  const registerClient = (clientName) => {
    const normalizedClientName = String(clientName || '').trim();
    const clientKey = normalizeLookupKey(normalizedClientName);

    if (!normalizedClientName || !clientKey || clients.has(clientKey)) {
      return;
    }

    clients.set(clientKey, normalizedClientName);
  };

  if (clientDesignerMap) {
    for (const clientMeta of clientDesignerMap.values()) {
      const hasActiveClient = clientMeta?.ativo === true;
      const hasProductionContract =
        typeof clientMeta?.postsPerMonth === 'number'
        && Number.isFinite(clientMeta.postsPerMonth)
        && clientMeta.postsPerMonth > 0;

      if (hasActiveClient && hasProductionContract) {
        registerClient(clientMeta.clientName);
      }
    }
  }

  for (const task of tasks) {
    const hasActiveClient = task?.clienteAtivo === true;
    const hasProductionContract = typeof task?.clientePostsMes === 'number' && task.clientePostsMes > 0;

    if (hasActiveClient && hasProductionContract) {
      registerClient(task.clienteRelacionado);
    }
  }

  return [...clients.values()].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function normalizeLookupKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractClientAliases(value) {
  const rawValue = String(value || '').trim();
  const aliases = new Set();

  if (!rawValue) {
    return [];
  }

  aliases.add(rawValue);
  aliases.add(rawValue.replace(/\b(LTDA|LIMITADA|S\.?\s*A\.?|S\/A|ME|EIRELI|EPP)\b\.?$/i, '').trim());

  for (const match of rawValue.matchAll(/\(([^)]+)\)/g)) {
    const alias = String(match[1] || '').trim();
    if (alias) {
      aliases.add(alias);
    }
  }

  const bracketPrefix = rawValue.match(/^\s*\[([^\]]+)\]/);
  if (bracketPrefix?.[1]) {
    aliases.add(bracketPrefix[1].trim());
  }

  return [...aliases].filter(Boolean);
}

function resolveClientMeta(clientDesignerMap, candidates = []) {
  if (!clientDesignerMap) {
    return null;
  }

  for (const candidate of candidates) {
    for (const alias of extractClientAliases(candidate)) {
      const key = normalizeLookupKey(alias);
      if (!key) {
        continue;
      }

      const clientMeta = clientDesignerMap.get(key);
      if (clientMeta) {
        return clientMeta;
      }
    }
  }

  return null;
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [normalizeLookupKey(key), value]),
  );
}

function getRowValue(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row[normalizeLookupKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return fallback;
}

function getClientMetaPriority(clientMeta) {
  if (!clientMeta) return -1;

  const hasProductionContract =
    typeof clientMeta.postsPerMonth === 'number'
    && Number.isFinite(clientMeta.postsPerMonth)
    && clientMeta.postsPerMonth > 0;
  const hasDesigner = Boolean(String(clientMeta.designer || '').trim());

  if (clientMeta.ativo && hasProductionContract && hasDesigner) return 6;
  if (clientMeta.ativo && hasProductionContract) return 5;
  if (clientMeta.ativo && hasDesigner) return 4;
  if (clientMeta.ativo) return 3;
  if (hasProductionContract && hasDesigner) return 2;
  if (hasProductionContract || hasDesigner) return 1;
  return 0;
}

function shouldReplaceClientMeta(currentMeta, nextMeta) {
  const currentPriority = getClientMetaPriority(currentMeta);
  const nextPriority = getClientMetaPriority(nextMeta);

  if (nextPriority !== currentPriority) {
    return nextPriority > currentPriority;
  }

  const currentUpdatedAt = currentMeta?.updatedAt?.getTime?.() ?? 0;
  const nextUpdatedAt = nextMeta?.updatedAt?.getTime?.() ?? 0;
  return nextUpdatedAt >= currentUpdatedAt;
}

function formatDatePtBr(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function buildTaskTitle({ rawTitle, partner, dueDate }) {
  const normalizedTitle = String(rawTitle || '').trim();
  const normalizedPartner = String(partner || '').trim();

  if (
    normalizedTitle &&
    normalizeLookupKey(normalizedTitle) !== normalizeLookupKey(normalizedPartner)
  ) {
    return normalizedTitle;
  }

  if (normalizedPartner) {
    return `[${normalizedPartner.toUpperCase()}] POST ${formatDatePtBr(dueDate)}`;
  }

  return `POST ${formatDatePtBr(dueDate)}`;
}

async function loadClientDesignerMapFromSource() {
  logServerEvent('Fetching Goalfy clients');
  const response = await fetch(getRequiredEnv('GOALFY_CLIENTS_URL'), {
    signal: AbortSignal.timeout(GOALFY_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Goalfy Clients API error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const map = new Map();

  for (const row of rows) {
    const normalizedRow = normalizeRow(row);
    const companyName = String(getRowValue(normalizedRow, ['empresa', 'parceiro', 'cliente'])).trim();
    const titleName = String(getRowValue(normalizedRow, ['titulo', 'parceiro', 'cliente'])).trim();
    const clientName = companyName || titleName;
    const designer = String(getRowValue(normalizedRow, ['designer responsavel 1', 'responsavel 1', 'responsavel'])).trim();
    const disabledValue = String(getRowValue(normalizedRow, ['desabilitado'])).trim().toUpperCase();
    const postsPerMonthRaw = String(getRowValue(normalizedRow, ['quantidade de posts por mes'])).trim();
    const postsPerMonth = postsPerMonthRaw === '' ? null : Number(postsPerMonthRaw.replace(',', '.'));
    const ativo = disabledValue !== 'VERDADEIRO';

    if (clientName) {
      const clientMeta = {
        clientName,
        designer: designer ? normalizeDesignerName(designer) : '',
        ativo,
        postsPerMonth: Number.isFinite(postsPerMonth) ? postsPerMonth : null,
        updatedAt: parseOptionalDate(getRowValue(normalizedRow, ['atualizado em'])),
      };

      [companyName, titleName]
        .filter(Boolean)
        .flatMap((alias) => extractClientAliases(alias))
        .forEach((alias) => {
          const key = normalizeLookupKey(alias);
          if (shouldReplaceClientMeta(map.get(key), clientMeta)) {
            map.set(key, clientMeta);
          }
        });
    }
  }

  logServerEvent('Fetched Goalfy clients', { totalClients: map.size });
  return map;
}

async function fetchClientDesignerMap({ forceRefresh = false } = {}) {
  if (!forceRefresh && shouldUseCache(cachedClientDesignerMap, cachedClientDesignerMapAt, GOALFY_CLIENTS_CACHE_TTL_MS)) {
    logServerEvent('Returning cached Goalfy clients', {
      ageMs: nowMs() - cachedClientDesignerMapAt,
      totalClients: cachedClientDesignerMap.size,
    });
    return cachedClientDesignerMap;
  }

  if (!forceRefresh && inflightClientDesignerMapPromise) {
    logServerEvent('Awaiting inflight Goalfy clients request');
    return inflightClientDesignerMapPromise;
  }

  inflightClientDesignerMapPromise = loadClientDesignerMapFromSource()
    .then((map) => {
      cachedClientDesignerMap = map;
      cachedClientDesignerMapAt = nowMs();
      return map;
    })
    .finally(() => {
      inflightClientDesignerMapPromise = null;
    });

  return inflightClientDesignerMapPromise;
}

// Board "Posts Produção de Conteúdo" não tem os links de Drive/Editorial —
// esses campos moram no card de Calendário. Mapeamos por nome do Calendário
// (normalizado) para anexar esses links de volta em cada Post.
async function loadCalendarLinksMapFromSource() {
  logServerEvent('Fetching calendar links map');
  const response = await fetch(getRequiredEnv('GOALFY_CARDS_CALENDAR_BOARD_URL'), {
    signal: AbortSignal.timeout(GOALFY_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Goalfy Calendar board API error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const map = new Map();
  for (const row of rows) {
    const normalizedRow = normalizeRow(row);
    const calendarTitle = String(getRowValue(normalizedRow, ['titulo', 'calendario'])).trim();
    if (!calendarTitle) continue;

    map.set(normalizeLookupKey(calendarTitle), {
      linkDriveArtes: String(getRowValue(normalizedRow, ['link do drive das artes'])).trim(),
      linkCalendarioEditorial: String(getRowValue(normalizedRow, ['link do calendario editorial'])).trim(),
    });
  }

  logServerEvent('Fetched calendar links map', { totalCalendars: map.size });
  return map;
}

async function fetchCalendarLinksMap({ forceRefresh = false } = {}) {
  if (!forceRefresh && shouldUseCache(cachedCalendarLinksMap, cachedCalendarLinksMapAt, GOALFY_CLIENTS_CACHE_TTL_MS)) {
    return cachedCalendarLinksMap;
  }

  if (!forceRefresh && inflightCalendarLinksMapPromise) {
    return inflightCalendarLinksMapPromise;
  }

  inflightCalendarLinksMapPromise = loadCalendarLinksMapFromSource()
    .then((map) => {
      cachedCalendarLinksMap = map;
      cachedCalendarLinksMapAt = nowMs();
      return map;
    })
    .finally(() => {
      inflightCalendarLinksMapPromise = null;
    });

  return inflightCalendarLinksMapPromise;
}

function buildAdjustmentDedupKey(row) {
  const rawId = String(getRowValue(row, ['id'])).trim();
  if (rawId) {
    return `id:${rawId}`;
  }

  const cliente = String(getRowValue(row, ['cliente'])).trim();
  const tituloDemanda = String(getRowValue(row, ['titulo da demanda', 'titulo'])).trim();
  const tipoEntrega = String(getRowValue(row, ['tipo de entrega'])).trim();
  const criadoEm = String(getRowValue(row, ['criado em'])).trim();
  return `fallback:${cliente}|${tituloDemanda}|${tipoEntrega}|${criadoEm}`;
}

function normalizeOptionalText(value) {
  return String(value || '').trim();
}

function getBoardTaskSnapshotKey(row, index) {
  const identificador = normalizeOptionalText(getRowValue(row, ['identificador'], index));
  const updatedAt = parseOptionalDate(getRowValue(row, ['atualizado em']))
    || parseOptionalDate(getRowValue(row, ['data na fase atual']))
    || parseOptionalDate(getRowValue(row, ['criado em']));
  return `${identificador || index}|${updatedAt?.toISOString() || 'no-date'}`;
}

function buildTaskFromBoardRow(row, index, clientDesignerMap, calendarLinksMap) {
  const currentStage = String(getRowValue(row, ['fase atual'], 'Fazer')).trim();
  const tags = String(getRowValue(row, ['etiquetas']));
  const partner = String(getRowValue(row, ['parceiro'], 'Sem parceiro'));
  // Board "Posts Produção de Conteúdo" (2026-07-29): não tem coluna "Cliente"
  // nem "Parceiro" — o cliente é resolvido via "Calendário" (título do
  // calendário, geralmente "Cliente - Mês/Ano").
  const calendarioRaw = String(getRowValue(row, ['calendario'], '')).trim();
  const relatedClient = String(getRowValue(row, ['cliente'], calendarioRaw || partner)).trim();
  // "Conteúdo" é o campo de título no board novo; "Titulo da demanda"/"Titulo"
  // eram usados no board antigo.
  const rawTitle = String(getRowValue(row, ['conteudo', 'titulo']));
  const rawResponsible = normalizeDesignerName(getRowValue(row, ['responsaveis', 'responsavel']));
  const createdByResponsible = normalizeDesignerName(
    getRowValue(row, ['criado por', 'criador', 'created by', 'autor']),
  );
  const clientMeta = resolveClientMeta(clientDesignerMap, [relatedClient, calendarioRaw, partner, rawTitle]);
  const designerFromClient = clientMeta?.designer;
  const dueDate = parseDate(getRowValue(row, ['data de entrega', 'data de vencimento']));
  const resolvedDesigner = designerFromClient
    || (rawResponsible !== 'Sem designer' ? rawResponsible : 'Sem designer');
  const validationStartedAt = parseOptionalDate(
    getRowValue(row, ['primeira vez que entrou na fase validacao do cliente']),
  );
  const startedExecutingAt = parseOptionalDate(
    getRowValue(row, [
      'primeira vez que entrou na fase executando',
      'entrou na fase executando',
    ]),
  );
  const startedAssemblyAt = parseOptionalDate(
    getRowValue(row, [
      'primeira vez que entrou na fase montagem da apresentacao',
      'primeira vez que entrou na fase montagem',
      'entrou na fase montagem da apresentacao',
      'entrou na fase montagem',
    ]),
  );
  const currentStageStartedAt = parseOptionalDate(getRowValue(row, ['data na fase atual']));
  const validationTimeRaw = String(
    getRowValue(row, ['tempo total na fase validacao do cliente']),
  ).trim();
  const validationTimeDays = validationTimeRaw === '' ? null : Number(validationTimeRaw.replace(',', '.'));
  const approvedTimeRaw = String(
    getRowValue(row, ['tempo total na fase aprovado para programacao']),
  ).trim();
  const approvedTimeDays = approvedTimeRaw === '' ? null : Number(approvedTimeRaw.replace(',', '.'));
  const hadAdjustmentsValue = String(getRowValue(row, ['esta entrega teve ajustes?'])).trim().toUpperCase();
  const adjustmentLog = String(getRowValue(row, ['registro de ajustes'])).trim();
  const taskId = String(getRowValue(row, ['identificador'], index));

  return {
    id: taskId,
    contentType: parseContentType(tags),
    statusTags: parseStatusTags(tags),
    title: buildTaskTitle({ rawTitle, partner: relatedClient || partner, dueDate }),
    parceiro: partner,
    calendario: calendarioRaw,
    clienteRelacionado: clientMeta?.clientName || relatedClient || partner,
    // "Link do Drive" não existe direto no board de Posts novo — vem do
    // Calendário vinculado (cruzado por nome via calendarLinksMap).
    linkDrive:
      String(getRowValue(row, ['link do drive', 'link drive'])).trim()
      || calendarLinksMap?.get(normalizeLookupKey(calendarioRaw))?.linkDriveArtes
      || '',
    linkCalendarioEditorial: calendarLinksMap?.get(normalizeLookupKey(calendarioRaw))?.linkCalendarioEditorial || '',
    responsavel: resolvedDesigner,
    responsavelHistorico: createdByResponsible || rawResponsible || '',
    responsavelCliente: designerFromClient || resolvedDesigner,
    designerResponsavel1: designerFromClient || '',
    dataVencimento: dueDate,
    stage: stageMap[normalizeLookupKey(currentStage)] || 'fazer',
    tempoEstimadoHoras: 3,
    tempoGastoHoras: 0,
    criadoEm: parseOptionalDate(getRowValue(row, ['criado em'])),
    concluidoEm: parseOptionalDate(getRowValue(row, ['concluido em'])),
    dataNaFaseAtual: currentStageStartedAt,
    entrouExecutandoEm: startedExecutingAt,
    entrouMontagemEm: startedAssemblyAt,
    entrouValidacaoEm: validationStartedAt,
    tempoValidacaoDias: Number.isFinite(validationTimeDays) ? validationTimeDays : null,
    tempoAprovadoProgramacaoDias: Number.isFinite(approvedTimeDays) ? approvedTimeDays : null,
    teveAjustes: hadAdjustmentsValue === 'SIM' || adjustmentLog !== '',
    registroAjustes: adjustmentLog,
    clienteAtivo: clientMeta ? clientMeta.ativo : null,
    clientePostsMes: clientMeta?.postsPerMonth ?? null,
  };
}

async function loadGoalfyAdjustmentsFromSource() {
  logServerEvent('Fetching Goalfy adjustments');
  const response = await fetch(getRequiredEnv('GOALFY_ADJUSTMENTS_URL'), {
    signal: AbortSignal.timeout(GOALFY_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Goalfy Adjustments API error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  const normalizedRows = rows.map((row) => normalizeRow(row));

  const deduped = new Map();

  for (const row of normalizedRows) {
    const dedupKey = buildAdjustmentDedupKey(row);
    const createdAt = parseOptionalDate(getRowValue(row, ['criado em']));
    const updatedAt = parseOptionalDate(getRowValue(row, ['atualizado em'])) || createdAt;
    const createdBy = normalizeDesignerName(
      getRowValue(row, ['criado por', 'criador', 'created by', 'autor']),
    );

    const currentItem = {
      id: String(getRowValue(row, ['id'])).trim(),
      identificador: String(getRowValue(row, ['identificador'])).trim(),
      tipoEntrega: String(getRowValue(row, ['tipo de entrega'])).trim(),
      cliente: String(getRowValue(row, ['cliente', 'titulo'])).trim() || 'Sem cliente',
      criadoPor: createdBy,
      responsavel: normalizeDesignerName(getRowValue(row, ['responsavel', 'designer responsavel 1'])),
      titulo: String(getRowValue(row, ['titulo'])).trim(),
      tituloDemanda: String(getRowValue(row, ['titulo da demanda', 'titulo'])).trim(),
      board: String(getRowValue(row, ['board da entrega'])).trim(),
      motivoAjuste: String(getRowValue(row, ['qual o motivo do ajuste?'])).trim(),
      classificacaoExecucao: String(getRowValue(row, ['classifique a execucao desta demanda:'])).trim(),
      linkDrive: String(getRowValue(row, ['link drive'])).trim(),
      criadoEm: createdAt,
      atualizadoEm: updatedAt,
    };

    const existing = deduped.get(dedupKey);
    const currentTimestamp = updatedAt?.getTime() ?? createdAt?.getTime() ?? 0;
    const existingTimestamp = existing?.atualizadoEm?.getTime?.() ?? existing?.criadoEm?.getTime?.() ?? 0;

    if (!existing || currentTimestamp >= existingTimestamp) {
      deduped.set(dedupKey, currentItem);
    }
  }

  const adjustments = [...deduped.values()].filter((item) => item.tipoEntrega);
  logServerEvent('Fetched Goalfy adjustments', { totalAdjustments: adjustments.length });
  return adjustments;
}

async function fetchGoalfyAdjustments({ forceRefresh = false } = {}) {
  if (!forceRefresh && shouldUseCache(cachedGoalfyAdjustments, cachedGoalfyAdjustmentsAt, GOALFY_ADJUSTMENTS_CACHE_TTL_MS)) {
    logServerEvent('Returning cached Goalfy adjustments', {
      ageMs: nowMs() - cachedGoalfyAdjustmentsAt,
      totalAdjustments: cachedGoalfyAdjustments.length,
    });
    return cachedGoalfyAdjustments;
  }

  if (!forceRefresh && inflightGoalfyAdjustmentsPromise) {
    logServerEvent('Awaiting inflight Goalfy adjustments request');
    return inflightGoalfyAdjustmentsPromise;
  }

  inflightGoalfyAdjustmentsPromise = loadGoalfyAdjustmentsFromSource()
    .then((adjustments) => {
      cachedGoalfyAdjustments = adjustments;
      cachedGoalfyAdjustmentsAt = nowMs();
      return adjustments;
    })
    .finally(() => {
      inflightGoalfyAdjustmentsPromise = null;
    });

  return inflightGoalfyAdjustmentsPromise;
}

async function loadGoalfyBoardFromSource() {
  logServerEvent('Fetching Goalfy board');
  const response = await fetch(getRequiredEnv('GOALFY_BOARD_URL'), {
    signal: AbortSignal.timeout(GOALFY_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Goalfy API error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  return rows.map((row) => normalizeRow(row)).filter(
    (row) => normalizeLookupKey(getRowValue(row, ['fase atual'], 'Fazer')) !== 'arquivado',
  );
}

async function fetchGoalfyBoard({ forceRefresh = false } = {}) {
  if (!forceRefresh && shouldUseCache(cachedGoalfyBoard, cachedGoalfyBoardAt, GOALFY_BOARD_CACHE_TTL_MS)) {
    logServerEvent('Returning cached Goalfy board', {
      ageMs: nowMs() - cachedGoalfyBoardAt,
      totalRows: cachedGoalfyBoard.length,
    });
    return cachedGoalfyBoard;
  }

  if (!forceRefresh && inflightGoalfyBoardPromise) {
    logServerEvent('Awaiting inflight Goalfy board request');
    return inflightGoalfyBoardPromise;
  }

  inflightGoalfyBoardPromise = loadGoalfyBoardFromSource()
    .then((rows) => {
      cachedGoalfyBoard = rows;
      cachedGoalfyBoardAt = nowMs();
      return rows;
    })
    .finally(() => {
      inflightGoalfyBoardPromise = null;
    });

  return inflightGoalfyBoardPromise;
}

function buildClientDesignerMapFromCachedData(data) {
  const map = new Map();

  for (const task of data?.tasks || []) {
    const clientName = String(task.clienteRelacionado || task.parceiro || '').trim();
    if (!clientName) continue;

    const clientMeta = {
      clientName,
      designer: normalizeDesignerName(task.responsavelCliente || task.designerResponsavel1 || task.responsavel),
      ativo: task.clienteAtivo === true,
      postsPerMonth: typeof task.clientePostsMes === 'number' ? task.clientePostsMes : null,
    };

    [
      task.clienteRelacionado,
      task.parceiro,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .flatMap((alias) => extractClientAliases(alias))
      .forEach((alias) => {
        map.set(normalizeLookupKey(alias), clientMeta);
      });
  }

  return map;
}

function applyClientMetadataToData(data, clientDesignerMap) {
  if (!data || !clientDesignerMap) {
    return data;
  }

  return {
    ...data,
    tasks: (data.tasks || []).map((task) => {
      const clientMeta = resolveClientMeta(clientDesignerMap, [
        task.clienteRelacionado,
        task.parceiro,
        task.title,
      ]);

      if (!clientMeta) {
        return task;
      }

      const designerFromClient = clientMeta.designer;
      const resolvedDesigner = designerFromClient
        || (task.responsavel && task.responsavel !== 'Sem designer' ? task.responsavel : 'Sem designer');

      return {
        ...task,
        clienteRelacionado: clientMeta.clientName || task.clienteRelacionado || task.parceiro,
        responsavel: resolvedDesigner,
        responsavelCliente: designerFromClient || resolvedDesigner,
        designerResponsavel1: designerFromClient || '',
        clienteAtivo: clientMeta.ativo,
        clientePostsMes: clientMeta.postsPerMonth ?? null,
      };
    }),
  };
}

async function refreshCachedGoalfyClientMetadata({ forceRefresh = true } = {}) {
  if (!cachedGoalfyData) {
    return null;
  }

  const clientDesignerMap = await fetchClientDesignerMap({ forceRefresh });
  cachedGoalfyData = applyClientMetadataToData(cachedGoalfyData, clientDesignerMap);
  cachedGoalfyData = {
    ...cachedGoalfyData,
    designers: collectDesignerNames(cachedGoalfyData.tasks, clientDesignerMap),
    clients: collectActiveClientNames(cachedGoalfyData.tasks, clientDesignerMap),
  };
  cachedGoalfyDataAt = nowMs();
  void persistGoalfyData(cachedGoalfyData, cachedGoalfyDataAt);

  logServerEvent('Goalfy client metadata refreshed before board sync', {
    ...getGoalfyRefreshStatus(),
    tasks: cachedGoalfyData.tasks.length,
    designers: cachedGoalfyData.designers.length,
    clients: cachedGoalfyData.clients.length,
  });

  return cachedGoalfyData;
}

async function loadGoalfyDataFromSource({ forceBoardRefresh = false, forceAuxiliaryRefresh = false } = {}) {
  const startedAt = nowMs();
  const clientDesignerMapPromise = fetchClientDesignerMap({ forceRefresh: forceAuxiliaryRefresh })
    .catch((error) => {
      if (cachedGoalfyData) {
        logServerEvent('Falling back to cached Goalfy client metadata', {
          error: error?.message || String(error),
        });
        return buildClientDesignerMapFromCachedData(cachedGoalfyData);
      }

      throw error;
    });
  const adjustmentsPromise = !forceAuxiliaryRefresh && cachedGoalfyData
    ? Promise.resolve(cachedGoalfyData.adjustments || [])
    : fetchGoalfyAdjustments({ forceRefresh: forceAuxiliaryRefresh });

  const calendarLinksMapPromise = fetchCalendarLinksMap({ forceRefresh: forceAuxiliaryRefresh }).catch((error) => {
    logServerEvent('Calendar links map fetch failed, continuing without it', {
      error: error?.message || String(error),
    });
    return new Map();
  });

  const [activeRows, clientDesignerMap, adjustments, calendarLinksMap] = await Promise.all([
    fetchGoalfyBoard({ forceRefresh: forceBoardRefresh }),
    clientDesignerMapPromise,
    adjustmentsPromise,
    calendarLinksMapPromise,
  ]);

  const nextSnapshot = new Map();
  const tasks = activeRows.map((row, index) => {
    const snapshotKey = getBoardTaskSnapshotKey(row, index);
    const task = buildTaskFromBoardRow(row, index, clientDesignerMap, calendarLinksMap);
    nextSnapshot.set(task.id, {
      snapshotKey,
      task,
    });

    const cachedSnapshot = cachedGoalfyBoardTaskSnapshot.get(task.id);
    if (!forceAuxiliaryRefresh && cachedSnapshot && cachedSnapshot.snapshotKey === snapshotKey) {
      return cachedSnapshot.task;
    }

    return task;
  });
  cachedGoalfyBoardTaskSnapshot = nextSnapshot;

  logServerEvent('Goalfy source aggregation finished', {
    durationMs: getDurationMs(startedAt),
    tasks: tasks.length,
    adjustments: adjustments.length,
    clients: clientDesignerMap.size,
  });

  return {
    tasks,
    designers: collectDesignerNames(tasks, clientDesignerMap),
    adjustments,
    clients: collectActiveClientNames(tasks, clientDesignerMap),
  };
}

function triggerGoalfyBackgroundRefresh({ forceBoardRefresh = true, forceAuxiliaryRefresh = false } = {}) {
  if (inflightBackgroundRefreshPromise) {
    logServerEvent('Goalfy background refresh already in progress', getGoalfyRefreshStatus());
    return inflightBackgroundRefreshPromise;
  }

  goalfyRefreshState = {
    inProgress: true,
    startedAt: nowMs(),
    completedAt: goalfyRefreshState.completedAt,
    durationMs: 0,
    error: '',
  };

  inflightBackgroundRefreshPromise = loadGoalfyDataFromSource({
    forceBoardRefresh,
    forceAuxiliaryRefresh: false,
  })
    .then((data) => {
      cachedGoalfyData = data;
      cachedGoalfyDataAt = nowMs();
      void persistGoalfyData(data, cachedGoalfyDataAt);
      logServerEvent('Goalfy primary refresh data available', {
        ...getGoalfyRefreshStatus(),
        tasks: data.tasks.length,
      });

      if (!forceAuxiliaryRefresh) {
        return data;
      }

      return loadGoalfyDataFromSource({
        forceBoardRefresh: false,
        forceAuxiliaryRefresh: true,
      }).then((refinedData) => {
        cachedGoalfyData = refinedData;
        cachedGoalfyDataAt = nowMs();
        void persistGoalfyData(refinedData, cachedGoalfyDataAt);
        return refinedData;
      });
    })
    .then((data) => {
      goalfyRefreshState = {
        inProgress: false,
        startedAt: goalfyRefreshState.startedAt,
        completedAt: cachedGoalfyDataAt,
        durationMs: cachedGoalfyDataAt - goalfyRefreshState.startedAt,
        error: '',
      };
      logServerEvent('Goalfy background refresh finished', {
        ...getGoalfyRefreshStatus(),
        tasks: data.tasks.length,
      });
      return data;
    })
    .catch((error) => {
      goalfyRefreshState = {
        inProgress: false,
        startedAt: goalfyRefreshState.startedAt,
        completedAt: goalfyRefreshState.completedAt,
        durationMs: nowMs() - goalfyRefreshState.startedAt,
        error: error instanceof Error ? error.message : 'Unknown refresh error',
      };
      if (cachedGoalfyData) {
        logServerEvent('Keeping last persisted Goalfy data after refresh failure', {
          updatedAt: cachedGoalfyDataAt,
          tasks: cachedGoalfyData.tasks.length,
        });
      }
      logServerEvent('Goalfy background refresh failed', getGoalfyRefreshStatus());
      throw error;
    })
    .finally(() => {
      inflightBackgroundRefreshPromise = null;
    });

  return inflightBackgroundRefreshPromise;
}

function startGoalfyBackgroundRefresh(options, source) {
  void triggerGoalfyBackgroundRefresh(options).catch((error) => {
    console.error(`Goalfy ${source} failed`, error);
  });
}

function buildAdjustmentCountsByClient(adjustments) {
  const counts = {};

  for (const adjustment of adjustments || []) {
    if (normalizeLookupKey(adjustment.tipoEntrega) !== 'ajuste') continue;
    const key = normalizeLookupKey(adjustment.cliente);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

function getStatisticsWindowStart() {
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - 2);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildDashboardPayload(data) {
  return {
    tasks: data.tasks,
    designers: data.designers,
    adjustments: data.adjustments,
    adjustmentCountsByClient: buildAdjustmentCountsByClient(data.adjustments),
    clients: data.clients,
  };
}

function buildStatisticsPayload(data) {
  const windowStart = getStatisticsWindowStart();

  const tasks = data.tasks.filter((task) => {
    const dates = [task.criadoEm, task.concluidoEm, task.entrouValidacaoEm];
    return dates.some((date) => date instanceof Date && date >= windowStart);
  });

  const adjustments = data.adjustments.filter(
    (adjustment) => adjustment.criadoEm instanceof Date && adjustment.criadoEm >= windowStart,
  );

  return {
    tasks,
    designers: data.designers,
    adjustments,
  };
}

async function fetchGoalfyData({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedGoalfyData) {
    const ageMs = Date.now() - cachedGoalfyDataAt;

    if (ageMs < GOALFY_CACHE_TTL_MS) {
      logServerEvent('Returning cached Goalfy data', {
        ageMs,
        tasks: cachedGoalfyData.tasks.length,
      });
      return cachedGoalfyData;
    }

    logServerEvent('Returning persisted Goalfy data and refreshing in background', {
      ageMs,
      tasks: cachedGoalfyData.tasks.length,
    });
    startGoalfyBackgroundRefresh(
      {
        forceBoardRefresh: true,
        forceAuxiliaryRefresh: false,
      },
      'stale cache refresh',
    );
    return cachedGoalfyData;
  }

  if (!forceRefresh && inflightGoalfyDataPromise) {
    logServerEvent('Awaiting inflight Goalfy data request');
    return inflightGoalfyDataPromise;
  }

  inflightGoalfyDataPromise = loadGoalfyDataFromSource({
    forceBoardRefresh: forceRefresh,
    forceAuxiliaryRefresh: forceRefresh,
  })
    .then((data) => {
      cachedGoalfyData = data;
      cachedGoalfyDataAt = Date.now();
      void persistGoalfyData(data, cachedGoalfyDataAt);
      return data;
    })
    .catch(async (error) => {
      const persisted = await readPersistedGoalfyData();
      if (persisted?.data) {
        cachedGoalfyData = persisted.data;
        cachedGoalfyDataAt = persisted.updatedAt;
        logServerEvent('Using persisted Goalfy data after source failure', {
          updatedAt: cachedGoalfyDataAt,
          tasks: cachedGoalfyData.tasks.length,
        });
        return persisted.data;
      }

      throw error;
    })
    .finally(() => {
      inflightGoalfyDataPromise = null;
    });

  return inflightGoalfyDataPromise;
}

function getAiCacheKey(items) {
  return crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');
}

function getCachedAiRecommendations(cacheKey) {
  const cached = aiRecommendationsCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.createdAt > AI_RECOMMENDATIONS_TTL_MS) {
    aiRecommendationsCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function setCachedAiRecommendations(cacheKey, value) {
  aiRecommendationsCache.set(cacheKey, {
    createdAt: Date.now(),
    value,
  });
}

function parseJsonFromModelOutput(outputText) {
  const trimmed = String(outputText || '').trim();
  if (!trimmed) {
    throw new Error('Model returned empty output');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error('Model returned invalid JSON');
  }
}

function extractRetryDelayMs(errorResponse) {
  const retryInfo = errorResponse?.error?.details?.find(
    (detail) => detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
  );
  const retryDelay = retryInfo?.retryDelay;
  if (typeof retryDelay !== 'string') {
    return null;
  }

  const seconds = Number(retryDelay.replace(/s$/i, ''));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null;
}

function getAiProvider() {
  return String(process.env.AI_PROVIDER || '').trim().toLowerCase() === 'openai' ? 'openai' : 'gemini';
}

async function requestGeminiJson(model, apiKey, body) {
  const execute = async () => {
    const response = await fetch(`${GEMINI_API_BASE_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const responseJson = await response.json();
      const outputText =
        responseJson?.candidates?.[0]?.content?.parts
          ?.map((part) => part?.text || '')
          .join('\n')
          .trim() || '';
      return parseJsonFromModelOutput(outputText);
    }

    let errorResponse = null;
    try {
      errorResponse = await response.json();
    } catch {
      // ignore
    }

    const retryDelayMs = response.status === 429 ? extractRetryDelayMs(errorResponse) : null;
    if (retryDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryDelayMs, 65000)));
      const retryResponse = await fetch(`${GEMINI_API_BASE_URL}/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
        body: JSON.stringify(body),
      });

      if (retryResponse.ok) {
        const retryJson = await retryResponse.json();
        const retryText =
          retryJson?.candidates?.[0]?.content?.parts
            ?.map((part) => part?.text || '')
            .join('\n')
            .trim() || '';
        return parseJsonFromModelOutput(retryText);
      }
    }

    throw new Error(
      `Gemini API error: ${response.status}${errorResponse?.error?.message ? ` - ${errorResponse.error.message}` : ''}`,
    );
  };

  return execute();
}

async function requestOpenAiJson(model, apiKey, { systemText, userPayload, temperature = 0.8 }) {
  const response = await fetch(OPENAI_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: Math.max(280, Math.min(900, (Array.isArray(userPayload?.items) ? userPayload.items.length : 1) * 130)),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemText },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!response.ok) {
    let errorResponse = null;
    try {
      errorResponse = await response.json();
    } catch {
      // ignore
    }

    throw new Error(
      `OpenAI API error: ${response.status}${errorResponse?.error?.message ? ` - ${errorResponse.error.message}` : ''}`,
    );
  }

  const responseJson = await response.json();
  const outputText = responseJson?.choices?.[0]?.message?.content || '';
  return parseJsonFromModelOutput(outputText);
}

function buildFallbackAiClientRecommendation(item) {
  const highestStage = [
    ['validacao', item?.etapaCounts?.validacao || 0],
    ['fazer', item?.etapaCounts?.fazer || 0],
    ['executando', item?.etapaCounts?.executando || 0],
    ['direcaoArte', item?.etapaCounts?.direcaoArte || 0],
    ['montagem', item?.etapaCounts?.montagem || 0],
    ['aprovadoProgramacao', item?.etapaCounts?.aprovadoProgramacao || 0],
  ].sort((a, b) => b[1] - a[1])[0]?.[0];

  let tituloProblema = 'Conta estável';
  let leituraCenario = `${item.totalAtivas || 0} tarefas seguem abertas na conta, sem sinal predominante de urgência acima dos demais.`;
  let acaoRecomendada = 'Mantenha o fluxo atual da conta e puxe primeiro os itens com prazo mais próximo.';
  let categoria = 'Estável';

  if (item.atrasadoCount > 0) {
    tituloProblema = 'Atrasos acumulados na conta';
    leituraCenario = `${item.atrasadoCount} tarefas já estão vencidas, o que faz do atraso o problema mais crítico da conta neste momento.`;
    acaoRecomendada = 'Puxe imediatamente as entregas com vencimento mais próximo para reduzir a pressão sobre a conta.';
    categoria = 'Atraso';
  } else if (item.venceHojeOuAmanhaCount >= 2 || item.venceEmTresDiasCount >= 4) {
    tituloProblema = 'Conta com risco de atraso';
    leituraCenario = `${item.venceHojeOuAmanhaCount} tarefas vencem agora e ${item.venceEmTresDiasCount} concentram prazo muito curto, aumentando o risco de atraso em cascata.`;
    acaoRecomendada = 'Puxe agora as entregas com vencimento mais próximo para reduzir o risco de a conta entrar em atraso.';
    categoria = 'Prazo';
  } else if (item.bloqueadoCount > 0 || item.validacaoCount > 0) {
    const travamentoPorValidacao = item.validacaoCount >= 3 || item.validacaoCriticaCount >= 1;
    if (travamentoPorValidacao) {
      tituloProblema = 'Conta travada por validação';
      leituraCenario = `${item.validacaoCount} itens estão em validação e ${item.validacaoCriticaCount} já pedem retorno mais rápido do cliente, travando a continuidade do fluxo.`;
      acaoRecomendada = 'Acione hoje o cliente para liberar as aprovações pendentes que estão segurando o avanço da conta.';
      categoria = 'Validação';
    } else {
      tituloProblema = 'Conta bloqueada por dependências';
      leituraCenario = `${item.bloqueadoCount} tarefas estão aguardando material ou resposta, segurando o avanço da produção.`;
      acaoRecomendada = 'Concentre agora a cobrança das pendências externas que hoje impedem a conta de avançar.';
      categoria = 'Bloqueio';
    }
  } else if ((item?.etapaCounts?.fazer || 0) >= Math.max(4, Math.ceil((item.totalAtivas || 0) * 0.35))) {
    tituloProblema = 'Fila elevada na entrada da produção';
    leituraCenario = `${item.etapaCounts.fazer} tarefas ainda não foram iniciadas, concentrando volume relevante antes da execução.`;
    acaoRecomendada = 'Puxe primeiro os itens com prazo mais próximo para reduzir o acúmulo logo na entrada da produção.';
    categoria = 'Acúmulo';
  } else if (highestStage && (item?.etapaCounts?.[highestStage] || 0) >= 3) {
    tituloProblema = 'Conta com gargalo concentrado em etapa';
    leituraCenario = `${item.etapaCounts[highestStage]} tarefas estão concentradas em uma mesma etapa, segurando o giro normal da conta.`;
    acaoRecomendada = 'Ataque primeiro os itens mais antigos dessa etapa para destravar a passagem da conta para o próximo estágio.';
    categoria = 'Gargalo';
  } else if (item.bloqueadoCount >= 2) {
    tituloProblema = 'Conta bloqueada por dependências';
    leituraCenario = `${item.bloqueadoCount} tarefas estão aguardando material ou resposta, segurando o avanço da produção.`;
    acaoRecomendada = 'Concentre a cobrança das pendências externas que hoje impedem a conta de avançar.';
    categoria = 'Bloqueio';
  }

  return {
    cliente: String(item.cliente),
    tituloProblema,
    acaoRecomendada,
    categoria,
    prioridade: Number(item.prioridadeBase || item.score || 999),
  };
}

async function generateAiClientRecommendations(items) {
  const provider = getAiProvider();
  const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Object.fromEntries(
      items.map((item) => [
        String(item.cliente),
        buildFallbackAiClientRecommendation(item),
      ]),
    );
  }

  const cacheKey = getAiCacheKey(items);
  const cached = getCachedAiRecommendations(cacheKey);
  if (cached) {
    return cached;
  }

  const model = provider === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
  const requestRecommendations = async (requestItems) => {
    const systemText = [
      'Voce gera recomendacoes curtas em pt-BR para contas de uma agencia.',
      'Avalie em ordem: atrasos, risco de atraso, bloqueio ou validacao travando fluxo, fila em fazer, concentracao em etapa, conta estavel.',
      'Escolha apenas um problema principal por conta.',
      'Escreva de forma direta, natural, escaneavel e sem frases repetitivas.',
      'Use sinais concretos do payload quando existirem.',
      'Repita responsaveis exatamente como vieram no payload.',
      'categoria deve ser uma destas opcoes: Atraso, Prazo, Validacao, Bloqueio, Acumulo, Gargalo, Estavel.',
      'prioridade deve ordenar todas as contas em conjunto, com 1 para a mais urgente.',
      'Responda todas as contas recebidas.',
      'Responda somente com JSON valido no formato {"recommendations":[{"cliente":"...","responsaveis":["Nome"],"tituloProblema":"...","acaoRecomendada":"...","categoria":"Atraso","prioridade":1}]}.',
    ].join(' ');
    const userPayload = {
      instruction: 'Gere uma recomendacao unica para cada conta com base no contexto abaixo.',
      items: requestItems,
    };
    const parsed = provider === 'openai'
      ? await requestOpenAiJson(model, apiKey, { systemText, userPayload, temperature: 0.35 })
      : await requestGeminiJson(model, apiKey, {
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ parts: [{ text: JSON.stringify(userPayload) }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: 'application/json',
            maxOutputTokens: Math.max(280, Math.min(900, requestItems.length * 130)),
          },
        });
    return Object.fromEntries(
      (parsed?.recommendations || [])
        .filter((item) => item?.cliente && item?.tituloProblema && item?.acaoRecomendada)
        .map((item) => [
          String(item.cliente),
          {
            cliente: String(item.cliente),
            responsaveis: Array.isArray(item.responsaveis)
              ? item.responsaveis.map((value) => String(value).trim()).filter(Boolean)
              : [],
            tituloProblema: String(item.tituloProblema).trim(),
            acaoRecomendada: String(item.acaoRecomendada).trim(),
            categoria: String(item.categoria || '').trim() || 'Estável',
            prioridade: Number(item.prioridade) || 999,
          },
        ]),
    );
  };

  const mapped = await requestRecommendations(items);
  const unresolvedItems = items.filter((item) => !mapped[item.cliente]);
  if (unresolvedItems.length > 0) {
    for (const item of unresolvedItems) {
      mapped[String(item.cliente)] = buildFallbackAiClientRecommendation(item);
    }
  }

  setCachedAiRecommendations(cacheKey, mapped);
  return mapped;
}

function normalizeStorySection(section, fallback) {
  const safeItems = Array.isArray(section?.items)
    ? section.items
        .filter((item) => item?.headline && item?.body)
        .map((item) => ({
          label: item.label ? String(item.label).trim() : undefined,
          headline: String(item.headline).trim(),
          body: String(item.body).trim(),
        }))
    : fallback.items;

  return {
    title: String(section?.title || fallback.title).trim(),
    description: String(section?.description || fallback.description).trim(),
    items: safeItems.length > 0 ? safeItems : fallback.items,
    cta: section?.cta ? String(section.cta).trim() : fallback.cta,
    emphasis: ['high', 'medium', 'soft'].includes(section?.emphasis) ? section.emphasis : fallback.emphasis,
    tone: ['celebration', 'flow', 'warm', 'care', 'calm', 'closure'].includes(section?.tone) ? section.tone : fallback.tone,
  };
}

async function generateAiStatisticsChartSummary(payload, fallbackSummary) {
  const provider = getAiProvider();
  const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackSummary;
  }

  const cacheKey = getAiCacheKey({ type: 'statistics-chart-summary:v2', payload });
  const cached = getCachedAiRecommendations(cacheKey);
  if (cached) {
    return cached;
  }

  const model = provider === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
  const systemText = [
    'Voce escreve em portugues do Brasil um resumo muito curto para o topo de um grafico de entregas.',
    'O texto vai aparecer no lugar do titulo principal da tela.',
    'Use linguagem simples, direta, humana e agradavel de ler.',
    'Nao use tom tecnico, corporativo ou exagerado.',
    'Fale do ritmo do mes com base apenas nos dados recebidos.',
    'Nao invente numeros nem conclusoes fora do payload.',
    'Entregue uma unica frase curta, com no maximo 18 palavras.',
    'A frase deve soar como leitura do periodo, nao como rotulo estatico.',
    'A frase precisa ser orientadora e clara.',
    'Evite frases vagas, evasivas ou abertas demais, como "ainda ha caminho pela frente" ou equivalentes.',
    'Quando fizer sentido, deixe claro se o ritmo esta acima da meta, abaixo da meta ou alinhado com ela.',
    'Prefira conclusoes concretas sobre o momento do mes.',
    'Responda somente com JSON valido no formato {"summary":"..."}',
  ].join(' ');
  const userPayload = {
    instruction: 'Crie uma frase curta para resumir o grafico de ritmo de entregas deste periodo.',
    payload,
  };
  const parsed = provider === 'openai'
    ? await requestOpenAiJson(model, apiKey, { systemText, userPayload, temperature: 0.8 })
    : await requestGeminiJson(model, apiKey, {
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ parts: [{ text: JSON.stringify(userPayload) }] }],
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
      });

  const summary = {
    summary: String(parsed?.summary || fallbackSummary.summary).trim() || fallbackSummary.summary,
    source: 'ai',
  };

  setCachedAiRecommendations(cacheKey, summary);
  return summary;
}

async function generateAiStatisticsStory(payload, fallbackStory) {
  const provider = getAiProvider();
  const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackStory;
  }

  const cacheKey = getAiCacheKey({ type: 'statistics-story', payload });
  const cached = getCachedAiRecommendations(cacheKey);
  if (cached) {
    return cached;
  }

  const model = provider === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
  const systemText = [
    'Voce escreve em portugues do Brasil uma retrospectiva mensal para uma equipe de design.',
    'A experiencia tem clima editorial, leve, moderna e positiva, inspirada em retrospectiva de produto.',
    'Voce nao deve soar tecnico, corporativo, frio ou julgador.',
    'Use linguagem humana, curta, elegante e agradavel de ler.',
    'Voce deve transformar os dados em narrativa para uma interface em carrossel.',
    'Cada bloco precisa ter foco unico e hierarquia clara.',
    'O titulo de cada bloco deve ser forte, curto e memoravel.',
    'A descricao deve preparar a leitura daquele bloco em no maximo 2 frases.',
    'Cada item deve ter headline curta e body objetivo, sem repetir a mesma estrutura.',
    'Para clientes, use tom leve e respeitoso, evitando linguagem negativa pesada.',
    'Para designers, use tom de reconhecimento e leitura de momento, nunca cobranca.',
    'Voce deve respeitar a estrutura visual pedida pela interface e responder somente com JSON valido.',
    'Nao invente numeros nem nomes que nao estejam no payload.',
    'Use tons apenas dentre: celebration, flow, warm, care, calm, closure.',
    'Use emphasis apenas dentre: high, medium, soft.',
    'Responda no formato {"hero":{...},"numbers":{...},"highlights":{...},"story":{...},"clients":{...},"designers":{...},"continuity":{...},"closing":{...}}.',
  ].join(' ');
  const userPayload = {
    instruction: 'Crie o conteudo textual completo da retrospectiva com base nestes dados e regras.',
    payload,
  };
  const parsed = provider === 'openai'
    ? await requestOpenAiJson(model, apiKey, { systemText, userPayload, temperature: 0.9 })
    : await requestGeminiJson(model, apiKey, {
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ parts: [{ text: JSON.stringify(userPayload) }] }],
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      });
  const story = {
    hero: normalizeStorySection(parsed?.hero, fallbackStory.hero),
    numbers: normalizeStorySection(parsed?.numbers, fallbackStory.numbers),
    highlights: normalizeStorySection(parsed?.highlights, fallbackStory.highlights),
    story: normalizeStorySection(parsed?.story, fallbackStory.story),
    clients: normalizeStorySection(parsed?.clients, fallbackStory.clients),
    designers: normalizeStorySection(parsed?.designers, fallbackStory.designers),
    continuity: normalizeStorySection(parsed?.continuity, fallbackStory.continuity),
    closing: normalizeStorySection(parsed?.closing, fallbackStory.closing),
    source: 'ai',
  };

  setCachedAiRecommendations(cacheKey, story);
  return story;
}

async function generateAiDesignerClientReferences(payload) {
  const provider = getAiProvider();
  const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return [];
  }

  const cacheKey = getAiCacheKey({ type: 'designer-client-references:v3', payload });
  const cached = getCachedAiRecommendations(cacheKey);
  if (cached) {
    return cached;
  }

  const model = provider === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
  const ensureClientLead = (cliente, message) => {
    const normalizedClient = String(cliente || '').trim();
    const normalizedMessage = String(message || '').trim();

    if (!normalizedClient) return normalizedMessage;
    if (!normalizedMessage) return normalizedClient;

    const loweredClient = normalizedClient.toLowerCase();
    const loweredMessage = normalizedMessage.toLowerCase();

    if (loweredMessage.startsWith(loweredClient)) {
      return normalizedMessage;
    }

    return `${normalizedClient}: ${normalizedMessage.charAt(0).toLowerCase()}${normalizedMessage.slice(1)}`;
  };
  const requestReferences = async (requestPayload) => {
    const systemText = [
      'Voce escreve textos curtos em portugues do Brasil para cards de acompanhamento de designers.',
      'O objetivo e deixar a linguagem mais natural, menos repetitiva e mais personalizada para cada designer e cliente.',
      'Voce deve manter tom profissional, leve e especifico, sem parecer generico.',
      'Escreva como uma conversa curta com o designer, de forma leve, simples, direta e pessoal.',
      'Pode falar diretamente com o designer usando voce, mas sem usar primeira pessoa do plural.',
      'Nao personifique clientes, contas ou times. Nao diga que cliente quer, pede, solicita, precisa, cobra, espera ou deseja algo.',
      'Nao invente contexto subjetivo. Use apenas sinais concretos do payload, como volume ativo, entregas em execucao, atrasos, bloqueios, validacao critica e frente dos proximos 14 dias.',
      'Evite usar a palavra peca ou pecas. Prefira entrega, post, conteudo ou demanda, conforme soar mais natural.',
      'Para tone warning, descreva a situacao da conta com foco em acompanhamento do fluxo, sem dramatizar e sem atribuir intencao.',
      'Para tone success, descreva estabilidade, consistencia ou bom ritmo do fluxo, sem exagero.',
      'Evite tom de relatorio ou parecer de auditoria.',
      'Prefira frases curtas, naturais e escaneaveis.',
      'Soe como alguem do time falando com o designer no dia a dia.',
      'Prefira construcoes como "Voce pode seguir assim", "Vale olhar isso agora", "Esse cliente esta leve", "Aqui compensa puxar primeiro" e "Da para respirar melhor nessa frente".',
      'A mensagem precisa citar explicitamente a conta em questao logo no comeco da primeira frase.',
      'A primeira frase deve comecar pelo nome do cliente ou conta informado em cliente.',
      'Nunca entregue uma mensagem generica sem identificar a conta.',
      'Evite repetir abertura, verbo ou estrutura entre as referencias.',
      'Responda para todas as referencias recebidas, sem omitir nenhuma.',
      'Responda somente com JSON valido no formato {"references":[{"tone":"success","cliente":"...","message":"...","highlight":"..."}]}.',
    ].join(' ');
    const userPayload = {
      instruction: 'Crie os textos das referencias do designer a partir dos sinais crus da conta, sem reutilizar frases prontas e sem personificar clientes.',
      payload: requestPayload,
    };
    const parsed = provider === 'openai'
      ? await requestOpenAiJson(model, apiKey, { systemText, userPayload, temperature: 0.85 })
      : await requestGeminiJson(model, apiKey, {
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ parts: [{ text: JSON.stringify(userPayload) }] }],
          generationConfig: { temperature: 0.85, responseMimeType: 'application/json' },
        });

    return Array.isArray(parsed?.references)
      ? parsed.references
          .filter((item) => item?.cliente && item?.message && item?.highlight)
          .map((item) => ({
            tone: item.tone === 'warning' ? 'warning' : 'success',
            cliente: String(item.cliente).trim(),
            message: ensureClientLead(item.cliente, item.message),
            highlight: String(item.highlight).trim(),
          }))
      : [];
  };

  const references = await requestReferences(payload);
  const mapped = new Map(references.map((item) => [normalizeLookupKey(item.cliente), item]));
  const missingReferences = Array.isArray(payload?.references)
    ? payload.references.filter((item) => !mapped.has(normalizeLookupKey(item?.cliente)))
    : [];

  if (missingReferences.length > 0) {
    const retriedReferences = await requestReferences({
      ...payload,
      references: missingReferences,
    });

    for (const item of retriedReferences) {
      mapped.set(normalizeLookupKey(item.cliente), item);
    }
  }

  const normalizedReferences = Array.isArray(payload?.references)
    ? payload.references
        .map((item) => mapped.get(normalizeLookupKey(item?.cliente)))
        .filter(Boolean)
    : [];

  setCachedAiRecommendations(cacheKey, normalizedReferences);
  return normalizedReferences;
}

async function generateAiDesignerClientReferencesBatch(payloads) {
  const provider = getAiProvider();
  const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {};
  }

  const cacheKey = getAiCacheKey({ type: 'designer-client-references-batch:v3', payloads });
  const cached = getCachedAiRecommendations(cacheKey);
  if (cached) {
    return cached;
  }

  const model = provider === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
  const ensureClientLead = (cliente, message) => {
    const normalizedClient = String(cliente || '').trim();
    const normalizedMessage = String(message || '').trim();

    if (!normalizedClient) return normalizedMessage;
    if (!normalizedMessage) return normalizedClient;

    const loweredClient = normalizedClient.toLowerCase();
    const loweredMessage = normalizedMessage.toLowerCase();

    if (loweredMessage.startsWith(loweredClient)) {
      return normalizedMessage;
    }

    return `${normalizedClient}: ${normalizedMessage.charAt(0).toLowerCase()}${normalizedMessage.slice(1)}`;
  };
  const systemText = [
    'Voce escreve textos curtos em portugues do Brasil para cards de acompanhamento de designers.',
    'A resposta deve ser personalizada por designer e por cliente, com tom editorial e leitura de momento.',
    'Escreva como uma conversa curta com o designer, de forma leve, simples, direta e pessoal.',
    'Pode falar diretamente com cada designer usando voce, mas sem usar primeira pessoa do plural.',
    'Nao personifique clientes, contas ou times.',
    'Use apenas sinais concretos do payload.',
    'Use o vocabulario do time: entrega, post, conteudo, demanda, cobertura, bloqueada, frente, validacao, prazo, pendencia, destravar, ritmo e fluxo.',
    'Evite usar a palavra peca ou pecas.',
    'Evite tom de relatorio ou parecer de auditoria.',
    'Prefira frases curtas, naturais e escaneaveis.',
    'Soe como alguem do time falando com o designer no dia a dia.',
    'Prefira construcoes como "Voce pode seguir assim", "Vale olhar isso agora", "Esse cliente esta leve", "Aqui compensa puxar primeiro" e "Da para respirar melhor nessa frente".',
    'Toda mensagem precisa citar explicitamente a conta em questao logo no comeco da primeira frase.',
    'A primeira frase deve comecar pelo nome do cliente ou conta informado em cliente.',
    'Nunca entregue uma mensagem generica sem identificar a conta.',
    'Evite repetir abertura, verbo ou estrutura entre designers diferentes.',
    'Responda para todos os designers e para todas as referencias recebidas, sem omitir nenhuma.',
    'Responda somente com JSON valido no formato {"designers":[{"designer":"Nome","references":[{"tone":"success","cliente":"...","message":"...","highlight":"..."}]}]}.',
  ].join(' ');
  const userPayload = {
    instruction: 'Crie em lote os textos das referencias dos designers a partir dos sinais crus da conta, sem reutilizar frases prontas.',
    payloads,
  };
  const parsed = provider === 'openai'
    ? await requestOpenAiJson(model, apiKey, { systemText, userPayload, temperature: 0.9 })
    : await requestGeminiJson(model, apiKey, {
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ parts: [{ text: JSON.stringify(userPayload) }] }],
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      });

  const normalized = Object.fromEntries(
    (Array.isArray(parsed?.designers) ? parsed.designers : [])
      .filter((item) => item?.designer)
      .map((item) => [
        String(item.designer).trim(),
        Array.isArray(item.references)
          ? item.references
              .filter((reference) => reference?.cliente && reference?.message && reference?.highlight)
              .map((reference) => ({
                tone: reference.tone === 'warning' ? 'warning' : 'success',
                cliente: String(reference.cliente).trim(),
                message: ensureClientLead(reference.cliente, reference.message),
                highlight: String(reference.highlight).trim(),
              }))
          : [],
      ]),
  );

  setCachedAiRecommendations(cacheKey, normalized);
  return normalized;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body ?? {};
    const users = getAuthUsers();
    const normalizedIdentifier = String(identifier || email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    const found = users.find(
      (user) => {
        const normalizedEmail = user.email.toLowerCase();
        const normalizedUsername = String(user.username || '').toLowerCase();

        return (
          (normalizedEmail === normalizedIdentifier || normalizedUsername === normalizedIdentifier) &&
          user.password === normalizedPassword
        );
      },
    );

    if (!found) {
      logServerEvent('Login rejected', {
        attemptedIdentifier: normalizedIdentifier,
        configuredUsers: users.map((user) => user.username || user.email),
        authUsersLength: users.length,
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = createSessionToken(found);

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });

    if (!cachedGoalfyData) {
      const persistedGoalfyData = await readPersistedGoalfyData();
      if (persistedGoalfyData?.data) {
        cachedGoalfyData = persistedGoalfyData.data;
        cachedGoalfyDataAt = persistedGoalfyData.updatedAt;
      }
    }

    res.json({
      user: sanitizeUser(found),
      dashboardData: cachedGoalfyData ? buildDashboardPayload(cachedGoalfyData) : null,
      dashboardUpdatedAt: cachedGoalfyDataAt || 0,
    });
  } catch (error) {
    console.error('Login failed with server error', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

app.get('/api/goalfy-data', requireAuth, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    logServerEvent('Goalfy data request started', {
      user: req.user?.email,
      forceRefresh,
    });
    const data = await fetchGoalfyData({ forceRefresh });
    logServerEvent('Goalfy data request finished', {
      tasks: data.tasks.length,
      designers: data.designers.length,
    });
    res.json(buildDashboardPayload(data));
  } catch (error) {
    console.error('Goalfy data request failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/goalfy-refresh', requireAuth, async (req, res) => {
  try {
    if (!cachedGoalfyData) {
      const persistedGoalfyData = await readPersistedGoalfyData();
      if (persistedGoalfyData?.data) {
        cachedGoalfyData = persistedGoalfyData.data;
        cachedGoalfyDataAt = persistedGoalfyData.updatedAt;
      }
    }

    if (cachedGoalfyData) {
      await refreshCachedGoalfyClientMetadata({ forceRefresh: true });
    }

    startGoalfyBackgroundRefresh({
      forceBoardRefresh: true,
      forceAuxiliaryRefresh: true,
    }, 'manual refresh');

    res.json({
      started: true,
      immediate: true,
      status: getGoalfyRefreshStatus(),
      data: cachedGoalfyData ? buildDashboardPayload(cachedGoalfyData) : null,
    });
  } catch (error) {
    console.error('Goalfy refresh trigger failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/goalfy-refresh-status', requireAuth, async (_req, res) => {
  res.json(getGoalfyRefreshStatus());
});

app.get('/api/goalfy-statistics-data', requireAuth, async (req, res) => {
  try {
    const data = await fetchGoalfyData({ forceRefresh: false });
    const statisticsPayload = buildStatisticsPayload(data);
    res.json(statisticsPayload);
  } catch (error) {
    console.error('Goalfy statistics request failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/client-actions', requireAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      res.json({ recommendations: {}, source: 'empty' });
      return;
    }

    const recommendations = await generateAiClientRecommendations(items);
    res.json({
      recommendations,
      source: Object.keys(recommendations).length > 0 ? 'ai' : 'fallback',
    });
  } catch (error) {
    console.error('AI client actions request failed', error);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const fallbackRecommendations = Object.fromEntries(
      items.map((item) => [
        String(item.cliente),
        buildFallbackAiClientRecommendation(item),
      ]),
    );
    res.status(200).json({
      recommendations: fallbackRecommendations,
      source: 'fallback',
    });
  }
});

app.post('/api/ai/statistics-story', requireAuth, async (req, res) => {
  try {
    const payload = req.body?.payload;
    const fallbackStory = req.body?.fallbackStory;

    if (!payload || !fallbackStory) {
      res.status(400).json({ error: 'Missing payload or fallbackStory' });
      return;
    }

    const story = await generateAiStatisticsStory(payload, fallbackStory);
    res.json({ story, source: story.source || 'ai' });
  } catch (error) {
    console.error('AI statistics story request failed', error);
    res.status(200).json({
      story: req.body?.fallbackStory || null,
      source: 'fallback',
    });
  }
});

app.post('/api/ai/statistics-chart-summary', requireAuth, async (req, res) => {
  try {
    const payload = req.body?.payload;
    const fallbackSummary = req.body?.fallbackSummary;

    if (!payload || !fallbackSummary) {
      res.status(400).json({ error: 'Missing payload or fallbackSummary' });
      return;
    }

    const summary = await generateAiStatisticsChartSummary(payload, fallbackSummary);
    res.json({ summary, source: summary.source || 'ai' });
  } catch (error) {
    console.error('AI statistics chart summary request failed', error);
    res.status(200).json({
      summary: req.body?.fallbackSummary || null,
      source: 'fallback',
    });
  }
});

app.post('/api/ai/designer-client-references', requireAuth, async (req, res) => {
  try {
    const payload = req.body?.payload;
    if (!payload || !Array.isArray(payload?.references) || payload.references.length === 0) {
      res.json({ references: [], source: 'empty' });
      return;
    }

    const references = await generateAiDesignerClientReferences(payload);
    res.json({ references, source: 'ai' });
  } catch (error) {
    console.error('AI designer references request failed', error);
    res.status(200).json({
      references: [],
      source: 'fallback',
    });
  }
});

app.post('/api/ai/designer-client-references-batch', requireAuth, async (req, res) => {
  try {
    const payloads = Array.isArray(req.body?.payloads) ? req.body.payloads : [];
    const validPayloads = payloads.filter(
      (payload) => payload && Array.isArray(payload.references) && payload.references.length > 0,
    );

    if (validPayloads.length === 0) {
      res.json({ designers: {}, source: 'empty' });
      return;
    }

    const designers = await generateAiDesignerClientReferencesBatch(validPayloads);
    res.json({ designers, source: 'ai' });
  } catch (error) {
    console.error('AI designer references batch request failed', error);
    res.status(200).json({
      designers: {},
      source: 'fallback',
    });
  }
});

const GOALFY_API_BASE_URL = 'https://api.goalfy.com.br/api';

app.get('/api/criar-cards/ping', requireAuth, async (_req, res) => {
  const writeToken = process.env.GOALFY_CARDS_WRITE_TOKEN;
  if (!writeToken) {
    res.status(500).json({ error: 'GOALFY_CARDS_WRITE_TOKEN not configured' });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOALFY_FETCH_TIMEOUT_MS);

    const response = await fetch(`${GOALFY_API_BASE_URL}/user`, {
      headers: { Authorization: `Token ${writeToken}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      logServerEvent('Goalfy write-token ping failed', { status: response.status });
      res.status(response.status).json({ error: 'Goalfy token check failed', status: response.status, body });
      return;
    }

    logServerEvent('Goalfy write-token ping succeeded', { status: response.status });
    res.json({ ok: true, user: body });
  } catch (error) {
    console.error('Goalfy write-token ping errored', error);
    res.status(500).json({ error: error.message });
  }
});

const CARDS_POSTS_MODEL_ID = 'e4f3df53-8085-461b-85d8-7b8d38a6e378';
const CARDS_POST_CONTEUDO_FIELD_ID = '9c097656-08c4-490e-81b7-70df5d53ca16';
const CARDS_POST_CALENDARIO_FIELD_ID = 'f29e52ef-8afd-4239-bd33-505e148f08c8';
const CARDS_POST_FORMATO_FIELD_ID = '82d1d68c-1246-4608-9f8e-86ae251aa785';
const CARDS_POST_DATA_ENTREGA_FIELD_ID = 'ab32aa3a-fe5f-4cb6-9a72-80de449f4811';
const CARDS_CALENDAR_BOARD_ID = '14dbab80-535b-49bd-9c01-4006d2d92388';
const CARDS_CALENDAR_PHASE_CAIXA_ENTRADA_ID = '715f4368-e23d-4581-bec6-5442a3916222';
const CARDS_CALENDAR_PHASE_EM_ANDAMENTO_ID = 'cca763ea-ab4d-4ea0-8a6c-fcd83eceab10';
const CARDS_CALENDAR_PHASE_POSTS_PROGRAMADOS_ID = '5dcada9c-8cab-4eeb-b3f0-5632cdeb05be';
// Fases do board de Calendário na Goalfy (id -> título/cor), buscadas via
// GET /boards/{CARDS_CALENDAR_BOARD_ID}. Cores são as mesmas usadas na Goalfy
// para cada fase (traduzidas de --choice-*-900 para hex aproximado).
const CARDS_CALENDAR_PHASES = {
  [CARDS_CALENDAR_PHASE_CAIXA_ENTRADA_ID]: { title: 'Caixa de Entrada', color: '#ef4444' },
  [CARDS_CALENDAR_PHASE_EM_ANDAMENTO_ID]: { title: 'Em Andamento', color: '#f97316' },
  [CARDS_CALENDAR_PHASE_POSTS_PROGRAMADOS_ID]: { title: 'Posts Programados', color: '#22c55e' },
};
const CARDS_CALENDAR_FIELD_PRIMEIRO_DIA_ID = '5c0802d8-cf18-4f62-836a-fb0a64663b9b';
const CARDS_CALENDAR_FIELD_CLIENTE_ID = '161d97db-7214-4d95-bc02-a332e607e6d9';
const CARDS_CLIENTS_DATABASE_ID = '652cab0e-7792-409c-81a0-b3cba1447209';
const CARDS_CLIENT_FIELD_NOME_ID = 'b794bfc5-f574-4b39-94b1-4c3b55345cdc';
const CARDS_CLIENT_FIELD_DESIGNER_ID = '460d3f59-8038-43a9-a05e-b96b9e523d4a';
const CARDS_CLIENT_FIELD_PLANEJADOR_ID = '91e3359f-2bee-41c5-b0b4-635ff03d29c9';
const CARDS_CLIENT_FIELD_COPYWRITER_ID = '649e9044-3ba0-4181-9aca-912dcbe896a5';
const CARDS_CLIENT_FIELD_POSTS_CONTRATADOS_ID = 'f019b499-0cd3-4d95-a2a2-ed8223a47ad8';
const CARDS_CLIENT_FIELD_LOCAIS_PUBLICACAO_ID = '9c3920b7-fd9e-460f-ac48-d21110fa969c';
const CARDS_CLIENT_FIELD_LINK_APRESENTACAO_ID = '72f4bb34-de63-4116-a8a0-ebc79c4acdf6';
const CARDS_CLIENT_FIELD_LINK_DRIVE_ID = 'e9603c0d-1b97-4e66-9f52-d5caacab8379';
const CARDS_POST_FORMATO_OPTIONS = ['Estático', 'Carrossel', 'Vídeo'];

function getGoalfyCardsWriteToken() {
  const writeToken = process.env.GOALFY_CARDS_WRITE_TOKEN;
  if (!writeToken) {
    throw new Error('GOALFY_CARDS_WRITE_TOKEN not configured');
  }
  return writeToken;
}

async function goalfyApiFetch(path, { method = 'GET', body, writeToken } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOALFY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${GOALFY_API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Token ${writeToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`Goalfy API error (status ${response.status})`);
      error.status = response.status;
      error.body = responseBody;
      throw error;
    }
    return responseBody;
  } finally {
    clearTimeout(timeout);
  }
}

function findFieldValue(fields, fieldInfoId) {
  const field = (fields || []).find((f) => f.infoId === fieldInfoId || f.fieldInfoId === fieldInfoId);
  if (!field) return null;
  return field.valueTitle ?? field.value ?? null;
}

// Datas devem usar o valor ISO (`value`), não `valueTitle` (formato dd/mm/yyyy,
// que o Date() do JS interpretaria incorretamente como mm/dd/yyyy).
function findFieldDateValue(fields, fieldInfoId) {
  const field = (fields || []).find((f) => f.infoId === fieldInfoId || f.fieldInfoId === fieldInfoId);
  return field?.value ?? null;
}

async function fetchGoalfyTagsForDatabase({ writeToken }) {
  const tags = await goalfyApiFetch(`/tags/${CARDS_CLIENTS_DATABASE_ID}`, { writeToken });
  const tagsById = new Map();
  for (const tag of tags || []) {
    tagsById.set(tag.id, { nome: tag.text, cor: tag.color });
  }
  return tagsById;
}

function findFieldTagIds(fields, fieldInfoId) {
  const field = (fields || []).find((f) => f.infoId === fieldInfoId || f.fieldInfoId === fieldInfoId);
  return Array.isArray(field?.value) ? field.value : [];
}

async function loadCardsClientsFromSource({ writeToken }) {
  logServerEvent('Fetching Criar Cards clients database');
  const registers = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const body = await goalfyApiFetch(`/databases/${CARDS_CLIENTS_DATABASE_ID}/filter?${qs}`, { writeToken });
    const page = body.registers || [];
    registers.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  const tagsById = await fetchGoalfyTagsForDatabase({ writeToken });

  const clients = registers.map((register) => ({
    id: register.id,
    nome: findFieldValue(register.fields, CARDS_CLIENT_FIELD_NOME_ID),
    designer: findFieldValue(register.fields, CARDS_CLIENT_FIELD_DESIGNER_ID),
    planejador: findFieldValue(register.fields, CARDS_CLIENT_FIELD_PLANEJADOR_ID),
    copywriter: findFieldValue(register.fields, CARDS_CLIENT_FIELD_COPYWRITER_ID),
    postsContratados: Number(findFieldValue(register.fields, CARDS_CLIENT_FIELD_POSTS_CONTRATADOS_ID)) || 0,
    locaisPublicacao: findFieldTagIds(register.fields, CARDS_CLIENT_FIELD_LOCAIS_PUBLICACAO_ID)
      .map((tagId) => tagsById.get(tagId))
      .filter(Boolean),
    linkApresentacao: findFieldValue(register.fields, CARDS_CLIENT_FIELD_LINK_APRESENTACAO_ID),
    linkDriveGeral: findFieldValue(register.fields, CARDS_CLIENT_FIELD_LINK_DRIVE_ID),
  }));

  logServerEvent('Fetched Criar Cards clients database', { totalClients: clients.length });
  return clients;
}

// Sem cache: dados cadastrais de cliente devem refletir mudanças imediatas
// (ex: trocar o Designer Responsável de um cliente na Goalfy).
async function fetchCardsClients({ writeToken } = {}) {
  return loadCardsClientsFromSource({ writeToken });
}

async function fetchAllGoalfyCardsInBoard({ boardId, writeToken }) {
  const cards = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset), search: '' });
    const body = await goalfyApiFetch(`/cards/board/${boardId}/filter?${qs}`, { writeToken });
    const page = body.cards || [];
    cards.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return cards;
}

async function findGoalfyCardInBoardByTitle({ boardId, title, writeToken }) {
  const qs = new URLSearchParams({ limit: '20', offset: '0', search: title });
  const body = await goalfyApiFetch(`/cards/board/${boardId}/filter?${qs}`, { writeToken });
  const targetKey = normalizeLookupKey(title);
  return (body.cards || []).find((card) => normalizeLookupKey(card.title) === targetKey) || null;
}

function formatMonthYear(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const months = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
  ];
  return `${months[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
}

function buildPostTitles({ clienteNome, mesAno, totalPosts }) {
  const paddedTotal = String(totalPosts).padStart(2, '0');
  return Array.from({ length: totalPosts }, (_, index) => {
    const sequencial = String(index + 1).padStart(2, '0');
    return `[${clienteNome.toUpperCase()}] ${mesAno} #${sequencial}/${paddedTotal}`;
  });
}

app.post('/api/criar-cards/test-create-post', requireAuth, async (req, res) => {
  const writeToken = process.env.GOALFY_CARDS_WRITE_TOKEN;
  if (!writeToken) {
    res.status(500).json({ error: 'GOALFY_CARDS_WRITE_TOKEN not configured' });
    return;
  }

  const calendarName = String(req.body?.calendarName || '').trim();
  if (!calendarName) {
    res.status(400).json({ error: 'calendarName is required' });
    return;
  }

  try {
    const match = await findGoalfyCardInBoardByTitle({
      boardId: CARDS_CALENDAR_BOARD_ID,
      title: calendarName,
      writeToken,
    });

    if (!match) {
      res.status(404).json({ error: `Calendar "${calendarName}" not found in calendar board` });
      return;
    }

    const calendarId = match.id;
    const postTitle = `TESTE AUTOMÁTICO - ${match.title} (pode apagar)`;

    logServerEvent('Creating test post card', { calendarName: match.title, calendarId });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOALFY_FETCH_TIMEOUT_MS);

    const createResponse = await fetch(`${GOALFY_API_BASE_URL}/cards/form?visibleEvent=true`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${writeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelId: CARDS_POSTS_MODEL_ID,
        fields: [
          { fieldInfoId: CARDS_POST_CONTEUDO_FIELD_ID, value: postTitle },
          { fieldInfoId: CARDS_POST_CALENDARIO_FIELD_ID, value: [calendarId] },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const body = await createResponse.json().catch(() => null);

    if (!createResponse.ok) {
      logServerEvent('Test post card creation failed', { status: createResponse.status, body });
      res.status(createResponse.status).json({ error: 'Goalfy card creation failed', status: createResponse.status, body });
      return;
    }

    logServerEvent('Test post card created', { id: body?.id, title: body?.title });
    res.json({ ok: true, calendar: { id: calendarId, title: match.title }, card: body });
  } catch (error) {
    console.error('Test post card creation errored', error);
    res.status(500).json({ error: error.message });
  }
});

// Retorna todos os calendários na fase "Caixa de Entrada" com o nome do
// Cliente vinculado já resolvido — base compartilhada por /designers (para
// saber quais designers têm calendário disponível) e /calendarios.
// Sem cache: precisa refletir na hora quando o usuário move um card de fase
// manualmente na Goalfy (board pequeno hoje, custo de buscar sempre ao vivo
// é baixo).
async function fetchInboxCalendars({ writeToken }) {
  const allCalendarCards = await fetchAllGoalfyCardsInBoard({ boardId: CARDS_CALENDAR_BOARD_ID, writeToken });

  const calendarios = [];
  for (const card of allCalendarCards) {
    if (card.phase !== 'Caixa de Entrada' && card.phaseId !== CARDS_CALENDAR_PHASE_CAIXA_ENTRADA_ID) continue;

    const cardDetail = await goalfyApiFetch(`/cards/${card.id}`, { writeToken });
    const clienteNome = findFieldValue(cardDetail.form?.fields, CARDS_CALENDAR_FIELD_CLIENTE_ID);
    if (!clienteNome) continue;

    const primeiroDia = findFieldDateValue(cardDetail.form?.fields, CARDS_CALENDAR_FIELD_PRIMEIRO_DIA_ID);
    calendarios.push({
      id: card.id,
      title: card.title,
      clienteNome,
      mesAno: formatMonthYear(primeiroDia),
    });
  }

  return calendarios;
}

// Todas as fases do board de Calendário (não só Caixa de Entrada), usada pela
// aba "Calendários". Sem cache pelo mesmo motivo de fetchInboxCalendars.
async function fetchAllCalendarsWithPhase({ writeToken }) {
  const allCalendarCards = await fetchAllGoalfyCardsInBoard({ boardId: CARDS_CALENDAR_BOARD_ID, writeToken });

  const calendarios = [];
  for (const card of allCalendarCards) {
    const cardDetail = await goalfyApiFetch(`/cards/${card.id}`, { writeToken });
    const clienteNome = findFieldValue(cardDetail.form?.fields, CARDS_CALENDAR_FIELD_CLIENTE_ID);
    const primeiroDia = findFieldDateValue(cardDetail.form?.fields, CARDS_CALENDAR_FIELD_PRIMEIRO_DIA_ID);
    const phase = CARDS_CALENDAR_PHASES[card.phaseId] || { title: card.phase || 'Sem fase', color: '#71717a' };

    calendarios.push({
      id: card.id,
      title: card.title,
      clienteNome: clienteNome || '',
      mesAno: formatMonthYear(primeiroDia),
      phaseTitle: phase.title,
      phaseColor: phase.color,
    });
  }

  return calendarios;
}

app.get('/api/calendarios', requireAuth, async (_req, res) => {
  try {
    const writeToken = getGoalfyCardsWriteToken();
    const [calendarios, clients, goalfyData] = await Promise.all([
      fetchAllCalendarsWithPhase({ writeToken }),
      fetchCardsClients({ writeToken }),
      fetchGoalfyData(),
    ]);

    const clientsByName = new Map(clients.map((c) => [normalizeLookupKey(c.nome), c]));
    const tasks = goalfyData?.tasks || [];

    const result = calendarios.map((calendario) => {
      const client = clientsByName.get(normalizeLookupKey(calendario.clienteNome));
      const calendarKey = normalizeLookupKey(calendario.title);
      const linkedTasks = tasks.filter((task) => normalizeLookupKey(task.calendario) === calendarKey);
      const postsConcluidos = linkedTasks.filter((task) => task.stage === 'concluido').length;

      return {
        id: calendario.id,
        title: calendario.title,
        clienteNome: calendario.clienteNome,
        mesAno: calendario.mesAno,
        phaseTitle: calendario.phaseTitle,
        phaseColor: calendario.phaseColor,
        postsContratados: client?.postsContratados ?? 0,
        postsConectados: linkedTasks.length,
        postsConcluidos,
      };
    });

    res.json({ calendarios: result });
  } catch (error) {
    console.error('Calendarios list request failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clientes', requireAuth, async (_req, res) => {
  try {
    const writeToken = getGoalfyCardsWriteToken();
    const clients = await fetchCardsClients({ writeToken });
    res.json({ clients });
  } catch (error) {
    console.error('Clientes list request failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clientes/designers', requireAuth, async (_req, res) => {
  try {
    const writeToken = getGoalfyCardsWriteToken();
    const clients = await fetchCardsClients({ writeToken });
    const designers = [...new Set(clients.map((c) => c.designer).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
    res.json({ designers });
  } catch (error) {
    console.error('Clientes designers request failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/criar-cards/designers', requireAuth, async (_req, res) => {
  try {
    const writeToken = getGoalfyCardsWriteToken();
    const [clients, inboxCalendarios] = await Promise.all([
      fetchCardsClients({ writeToken }),
      fetchInboxCalendars({ writeToken }),
    ]);

    const clientNamesWithInboxCalendar = new Set(
      inboxCalendarios.map((c) => normalizeLookupKey(c.clienteNome)),
    );

    const designers = [
      ...new Set(
        clients
          .filter((c) => clientNamesWithInboxCalendar.has(normalizeLookupKey(c.nome)))
          .map((c) => c.designer)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    res.json({ designers });
  } catch (error) {
    console.error('Criar Cards designers request failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/criar-cards/calendarios', requireAuth, async (req, res) => {
  const designer = String(req.query?.designer || '').trim();
  if (!designer) {
    res.status(400).json({ error: 'designer is required' });
    return;
  }

  try {
    const writeToken = getGoalfyCardsWriteToken();
    const clients = await fetchCardsClients({ writeToken });
    const designerKey = normalizeLookupKey(designer);
    const clientNamesForDesigner = new Set(
      clients.filter((c) => normalizeLookupKey(c.designer) === designerKey).map((c) => normalizeLookupKey(c.nome)),
    );

    if (clientNamesForDesigner.size === 0) {
      res.json({ calendarios: [] });
      return;
    }

    const inboxCalendarios = await fetchInboxCalendars({ writeToken });
    const calendarios = inboxCalendarios.filter((c) => clientNamesForDesigner.has(normalizeLookupKey(c.clienteNome)));

    res.json({ calendarios });
  } catch (error) {
    console.error('Criar Cards calendarios request failed', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/criar-cards/preview', requireAuth, async (req, res) => {
  const calendarId = String(req.query?.calendarId || '').trim();
  if (!calendarId) {
    res.status(400).json({ error: 'calendarId is required' });
    return;
  }

  try {
    const writeToken = getGoalfyCardsWriteToken();
    const cardDetail = await goalfyApiFetch(`/cards/${calendarId}`, { writeToken });
    const clienteNome = findFieldValue(cardDetail.form?.fields, CARDS_CALENDAR_FIELD_CLIENTE_ID);
    const primeiroDia = findFieldDateValue(cardDetail.form?.fields, CARDS_CALENDAR_FIELD_PRIMEIRO_DIA_ID);

    if (!clienteNome) {
      res.status(404).json({ error: 'Calendar has no linked Cliente' });
      return;
    }

    const clients = await fetchCardsClients({ writeToken });
    const clientKey = normalizeLookupKey(clienteNome);
    const client = clients.find((c) => normalizeLookupKey(c.nome) === clientKey);

    if (!client) {
      res.status(404).json({ error: `Cliente "${clienteNome}" not found in clients database` });
      return;
    }

    const mesAno = formatMonthYear(primeiroDia);
    const totalPosts = client.postsContratados;
    const titles = buildPostTitles({ clienteNome: client.nome, mesAno, totalPosts });

    const posts = titles.map((title, index) => ({
      index: index + 1,
      total: totalPosts,
      title,
      formato: CARDS_POST_FORMATO_OPTIONS[0],
    }));

    res.json({
      calendar: { id: calendarId, title: cardDetail.title, clienteNome: client.nome, mesAno },
      posts,
      formatoOptions: CARDS_POST_FORMATO_OPTIONS,
    });
  } catch (error) {
    console.error('Criar Cards preview request failed', error);
    res.status(500).json({ error: error.message });
  }
});

// Cria um único post. Usado pelo frontend em loop sequencial (em vez de
// create-batch) para poder mostrar progresso card-a-card na UI.
app.post('/api/criar-cards/create-one', requireAuth, async (req, res) => {
  const calendarId = String(req.body?.calendarId || '').trim();
  const dueDate = String(req.body?.dueDate || '').trim();
  const title = String(req.body?.title || '').trim();
  const formato = String(req.body?.formato || '').trim();

  if (!calendarId) {
    res.status(400).json({ error: 'calendarId is required' });
    return;
  }
  if (!dueDate) {
    res.status(400).json({ error: 'dueDate is required' });
    return;
  }
  if (!title || !CARDS_POST_FORMATO_OPTIONS.includes(formato)) {
    res.status(400).json({ error: 'Invalid title or formato' });
    return;
  }

  try {
    const writeToken = getGoalfyCardsWriteToken();
    const card = await goalfyApiFetch('/cards/form?visibleEvent=true', {
      method: 'POST',
      writeToken,
      body: {
        modelId: CARDS_POSTS_MODEL_ID,
        fields: [
          { fieldInfoId: CARDS_POST_CONTEUDO_FIELD_ID, value: title },
          { fieldInfoId: CARDS_POST_CALENDARIO_FIELD_ID, value: [calendarId] },
          { fieldInfoId: CARDS_POST_FORMATO_FIELD_ID, value: formato },
          { fieldInfoId: CARDS_POST_DATA_ENTREGA_FIELD_ID, value: dueDate },
        ],
      },
    });
    logServerEvent('Criar Cards: post created', { id: card.id, title });
    res.json({ ok: true, card: { id: card.id, title: card.title } });
  } catch (error) {
    logServerEvent('Criar Cards: post creation failed', { title, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/criar-cards/move-calendar-to-em-andamento', requireAuth, async (req, res) => {
  const calendarId = String(req.body?.calendarId || '').trim();
  if (!calendarId) {
    res.status(400).json({ error: 'calendarId is required' });
    return;
  }

  try {
    const writeToken = getGoalfyCardsWriteToken();
    await goalfyApiFetch(`/cards/moveTo/${calendarId}`, {
      method: 'PUT',
      writeToken,
      body: { phaseId: CARDS_CALENDAR_PHASE_EM_ANDAMENTO_ID },
    });
    res.json({ ok: true });
  } catch (error) {
    logServerEvent('Criar Cards: calendar move failed', { calendarId, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/criar-cards/create-batch', requireAuth, async (req, res) => {
  const calendarId = String(req.body?.calendarId || '').trim();
  const dueDate = String(req.body?.dueDate || '').trim();
  const posts = Array.isArray(req.body?.posts) ? req.body.posts : [];

  if (!calendarId) {
    res.status(400).json({ error: 'calendarId is required' });
    return;
  }
  if (!dueDate) {
    res.status(400).json({ error: 'dueDate is required' });
    return;
  }
  if (posts.length === 0) {
    res.status(400).json({ error: 'posts array is required and must not be empty' });
    return;
  }

  try {
    const writeToken = getGoalfyCardsWriteToken();
    const created = [];
    const failed = [];

    for (const post of posts) {
      const title = String(post?.title || '').trim();
      const formato = String(post?.formato || '').trim();

      if (!title || !CARDS_POST_FORMATO_OPTIONS.includes(formato)) {
        failed.push({ title: title || '(sem título)', error: 'Invalid title or formato' });
        continue;
      }

      try {
        const card = await goalfyApiFetch('/cards/form?visibleEvent=true', {
          method: 'POST',
          writeToken,
          body: {
            modelId: CARDS_POSTS_MODEL_ID,
            fields: [
              { fieldInfoId: CARDS_POST_CONTEUDO_FIELD_ID, value: title },
              { fieldInfoId: CARDS_POST_CALENDARIO_FIELD_ID, value: [calendarId] },
              { fieldInfoId: CARDS_POST_FORMATO_FIELD_ID, value: formato },
              { fieldInfoId: CARDS_POST_DATA_ENTREGA_FIELD_ID, value: dueDate },
            ],
          },
        });
        created.push({ id: card.id, title: card.title });
        logServerEvent('Criar Cards batch: post created', { id: card.id, title });
      } catch (error) {
        failed.push({ title, error: error.message });
        logServerEvent('Criar Cards batch: post creation failed', { title, error: error.message });
      }
    }

    let calendarMoved = false;
    if (created.length > 0) {
      try {
        await goalfyApiFetch(`/cards/moveTo/${calendarId}`, {
          method: 'PUT',
          writeToken,
          body: { phaseId: CARDS_CALENDAR_PHASE_EM_ANDAMENTO_ID },
        });
        calendarMoved = true;
      } catch (error) {
        logServerEvent('Criar Cards batch: calendar move failed', { calendarId, error: error.message });
      }
    }

    res.json({ created, failed, calendarMoved });
  } catch (error) {
    console.error('Criar Cards create-batch request failed', error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const distDir = path.join(__dirname, 'dist');
  const isProduction = process.env.NODE_ENV === 'production';
  let viteServer = null;

  const persistedGoalfyData = await readPersistedGoalfyData();
  if (persistedGoalfyData?.data) {
    cachedGoalfyData = persistedGoalfyData.data;
    cachedGoalfyDataAt = persistedGoalfyData.updatedAt;
    goalfyRefreshState.completedAt = persistedGoalfyData.updatedAt;
    goalfyRefreshState.durationMs = 0;
    logServerEvent('Loaded persisted Goalfy data on startup', {
      updatedAt: cachedGoalfyDataAt,
      tasks: cachedGoalfyData.tasks.length,
    });
  }

  if (isProduction) {
    app.use(express.static(distDir));
  } else {
    viteServer = await createViteServer({
      appType: 'custom',
      server: {
        middlewareMode: true,
      },
    });
    app.use(viteServer.middlewares);
  }

  app.use(async (req, res) => {
    try {
      if (viteServer) {
        let html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
        html = await viteServer.transformIndexHtml(req.originalUrl, html);
        res.status(200).type('html').send(html);
        return;
      }

      const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
      res.type('html').send(html);
    } catch {
      res.status(503).send(
        isProduction
          ? 'Build files not found. Run "npm run build" first.'
          : 'Vite dev server is not ready yet.',
      );
    }
  });

  app.listen(PORT, () => {
    try {
      const users = getAuthUsers();
      logServerEvent('Auth users loaded', {
        authUsersLength: users.length,
        configuredUsers: users.map((user) => user.username || user.email),
      });
    } catch (error) {
      console.error('Failed to load AUTH_USERS_JSON on startup', error);
    }

    console.log(
      `Server listening on http://localhost:${PORT} (${isProduction ? 'production' : 'development'} mode)`,
    );
  });
}

void startServer();
