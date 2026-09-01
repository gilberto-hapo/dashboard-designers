import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import { getDriveFileMetadata, getDriveFileBuffer } from './drive.js';

// Mesma service account usada em drive.js, mas com escopo dedicado ao
// Sheets — mantido em um client de auth separado (não reaproveita o de
// drive.js) para não alterar o escopo/comportamento já validado do Drive.
function parseServiceAccountJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

function getAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (credentialsJson) {
    const credentials = parseServiceAccountJson(credentialsJson);
    if (!credentials) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (nem em texto puro, nem em Base64)');
    }
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE must be configured');
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

let authClient = null;
function getCachedAuth() {
  if (!authClient) {
    authClient = getAuth();
  }
  return authClient;
}

const SHEETS_REQUEST_TIMEOUT_MS = 20000;

let sheetsClient = null;
function getSheets() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: 'v4', auth: getCachedAuth(), timeout: SHEETS_REQUEST_TIMEOUT_MS });
  }
  return sheetsClient;
}

export function extractSpreadsheetIdFromLink(link) {
  const match = String(link || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// O link aponta para uma aba específica via gid (ex: "...#gid=561449241") —
// a planilha real costuma ter uma aba por mês, então é o gid, não o nome da
// aba, que diz qual delas é a do calendário atual.
export function extractSheetGidFromLink(link) {
  const match = String(link || '').match(/[#&]gid=(\d+)/);
  return match ? Number(match[1]) : null;
}

// A planilha muda pouco durante o mês (é preenchida pelo planejador no
// início do ciclo), mas pode ser editada a qualquer momento — TTL curto em
// vez de longo como o do Drive/Goalfy, para refletir edições sem exigir um
// refresh manual dedicado para essa fonte.
const EDITORIAL_SHEET_TTL_MS = 1000 * 60 * 10;
const cache = new Map();

// Cabeçalhos aceitos por campo — comparação normalizada (minúsculo, sem
// acento) para tolerar pequenas variações de escrita entre planilhas de
// clientes/planejadores diferentes, já que não há um padrão obrigatório.
const HEADER_ALIASES = {
  oQue: ['o que', 'o que?', 'post'],
  dia: ['dia', 'data'],
  tituloTema: ['titulo/tema', 'titulo tema', 'titulo', 'tema'],
  aprofundamento: ['aprofundamento do tema', 'aprofundamento'],
  formato: ['formato conteudo', 'formato do conteudo', 'formato'],
  linhaEditorial: ['linha editorial', 'tipo de conteudo', 'categoria'],
};

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function buildColumnIndexMap(headerRow) {
  const normalized = (headerRow || []).map(normalizeHeader);
  const indexByField = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((header) => aliases.includes(header));
    if (index !== -1) {
      indexByField[field] = index;
    }
  }

  return indexByField;
}

function rowIsEmpty(row) {
  return !row || row.every((cell) => String(cell || '').trim() === '');
}

// A linha de cabeçalho não é necessariamente a primeira: planilhas reais
// têm linhas de metadados no topo (ex: "Parceiro: X", "Mês: Y", "Status do
// Calendário: ..."), então a linha de cabeçalho é localizada por conteúdo —
// a primeira linha que reconhece pelo menos 2 dos campos conhecidos.
function findHeaderRowIndex(values) {
  return values.findIndex((row) => Object.keys(buildColumnIndexMap(row)).length >= 2);
}

// Tolerante a colunas faltando: um campo não encontrado no cabeçalho vira
// string vazia em vez de quebrar o parse inteiro — planilhas variam entre
// clientes/planejadores e a aba deve mostrar o que existir.
function parseRows(values) {
  if (!values || values.length < 2) return [];

  const headerIndex = findHeaderRowIndex(values);
  if (headerIndex === -1) return [];

  const headerRow = values[headerIndex];
  const dataRows = values.slice(headerIndex + 1);
  const indexByField = buildColumnIndexMap(headerRow);

  return dataRows
    .filter((row) => !rowIsEmpty(row))
    .map((row) => ({
      oQue: String(row[indexByField.oQue] ?? '').trim(),
      dia: String(row[indexByField.dia] ?? '').trim(),
      tituloTema: String(row[indexByField.tituloTema] ?? '').trim(),
      aprofundamento: String(row[indexByField.aprofundamento] ?? '').trim(),
      formato: String(row[indexByField.formato] ?? '').trim(),
      linhaEditorial: String(row[indexByField.linhaEditorial] ?? '').trim(),
    }))
    .filter((item) => item.oQue || item.tituloTema)
    // Planilhas sem uma coluna "O quê?"/"Post" (ex: usam "Semana"/"Data" em
    // vez disso) deixam oQue vazio em toda linha — index garante um
    // identificador único por item mesmo assim, necessário porque o
    // Accordion da UI usa esse valor como chave/value de cada linha.
    .map((item, index) => (item.oQue ? item : { ...item, oQue: `Item ${index + 1}` }));
}


const OFFICE_SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
]);

// Resolve o nome da aba correspondente ao gid do link via metadata da
// planilha (spreadsheets.get) — a Sheets API só aceita nome de aba (ou
// índice) no range de values.get, não o gid diretamente.
async function resolveSheetTitleByGid(spreadsheetId, gid) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheetProps = res.data.sheets || [];
  if (gid == null) {
    return sheetProps[0]?.properties?.title || null;
  }
  const match = sheetProps.find((sheet) => sheet.properties?.sheetId === gid);
  return match?.properties?.title || sheetProps[0]?.properties?.title || null;
}

async function loadFromGoogleSheetsApi(spreadsheetId, gid) {
  const sheetTitle = await resolveSheetTitleByGid(spreadsheetId, gid);
  if (!sheetTitle) return [];

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Colunas A:G cobrem os 6 campos conhecidos com folga para uma coluna
    // vazia antes deles (visto em planilhas reais); colunas extras à
    // direita são ignoradas, não quebram.
    range: `'${sheetTitle}'!A:G`,
  });
  return parseRows(res.data.values);
}

// Nomes de mês em português (minúsculo, sem acento) para casar o mês do
// calendário (ex: "SETEMBRO/2026") contra o nome da aba (ex: "Setembro",
// "Janeiro - 2027") — usado só para arquivos .xlsx, onde o gid do link não
// existe dentro do arquivo (é um id gerado pelo Google só quando o Drive
// abre/converte o arquivo na hora de visualizar, não faz parte do .xlsx
// em si — confirmado testando: a API do Drive não expõe essa conversão
// para arquivos Office, "Export only supports Docs Editors files").
const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function findSheetNameForMonth(sheetNames, monthLabel) {
  const normalizedMonth = normalizeHeader(monthLabel).split('/')[0];
  if (!normalizedMonth || !MONTH_NAMES_PT.includes(normalizedMonth)) {
    return null;
  }

  // includes, não startsWith: abas costumam ter prefixo numérico variável
  // (ex: "10. Outubro", "01. Janeiro") que muda de planilha para planilha,
  // então o nome do mês pode aparecer no meio do nome da aba, não só no
  // início (confirmado com um caso real: aba "10. Outubro" não batia com
  // "outubro" via startsWith).
  return sheetNames.find((name) => normalizeHeader(name).includes(normalizedMonth)) || null;
}

// Alguns calendários referenciam um .xlsx enviado ao Drive em vez de uma
// planilha Google Sheets nativa (comum quando alguém faz upload de um Excel
// sem converter) — a Sheets API só lê planilhas nativas, então esse caso
// precisa passar pela API do Drive (mesma auth já usada para pastas/mídia)
// e ser parseado com a lib xlsx.
function loadFromOfficeFile(buffer, monthLabel) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = findSheetNameForMonth(workbook.SheetNames, monthLabel) || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const values = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
  return parseRows(values);
}

async function loadEditorialSheetFromSource(spreadsheetId, gid, monthLabel) {
  const metadata = await getDriveFileMetadata(spreadsheetId);
  if (OFFICE_SPREADSHEET_MIME_TYPES.has(metadata?.mimeType)) {
    const buffer = await getDriveFileBuffer(spreadsheetId);
    return loadFromOfficeFile(buffer, monthLabel);
  }
  return loadFromGoogleSheetsApi(spreadsheetId, gid);
}

// Fetch com cache + dedupe de chamadas concorrentes, mesmo padrão já usado
// para Goalfy/Drive em server.js/drive.js.
const inflightBySpreadsheetId = new Map();

// monthLabel: mesAno do calendário (ex: "SETEMBRO/2026") — usado como
// fallback para achar a aba certa em arquivos .xlsx, onde o gid do link
// não é utilizável (ver comentário em findSheetNameForMonth).
export async function getEditorialCalendarItems(link, monthLabel) {
  const spreadsheetId = extractSpreadsheetIdFromLink(link);
  if (!spreadsheetId) {
    throw new Error('Link do calendário editorial inválido ou vazio');
  }
  const gid = extractSheetGidFromLink(link);
  // Chave de cache inclui o gid/mês: a mesma planilha pode ser referenciada
  // com abas diferentes por calendários diferentes (uma aba por mês).
  const cacheKey = `${spreadsheetId}:${gid ?? monthLabel ?? 'default'}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < EDITORIAL_SHEET_TTL_MS) {
    return cached.items;
  }

  const inflight = inflightBySpreadsheetId.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const promise = loadEditorialSheetFromSource(spreadsheetId, gid, monthLabel)
    .then((items) => {
      cache.set(cacheKey, { items, at: Date.now() });
      return items;
    })
    .finally(() => {
      inflightBySpreadsheetId.delete(cacheKey);
    });

  inflightBySpreadsheetId.set(cacheKey, promise);
  return promise;
}
