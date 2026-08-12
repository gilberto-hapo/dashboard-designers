import { google } from 'googleapis';
import mammoth from 'mammoth';
import { Readable } from 'node:stream';

const DRIVE_FOLDER_TTL_MS = 1000 * 30;
const cache = new Map();

function parseServiceAccountJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    // Alguns paineis de hospedagem nao preservam bem aspas/quebras de linha em
    // variaveis de ambiente coladas manualmente; aceitar Base64 evita esse problema.
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch (base64Error) {
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
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE must be configured');
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

let authClient = null;
function getCachedAuth() {
  if (!authClient) {
    authClient = getAuth();
  }
  return authClient;
}

let driveClient = null;
function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: 'v3', auth: getCachedAuth() });
  }
  return driveClient;
}

export function extractFolderIdFromDriveLink(link) {
  const match = String(link || '').match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function listChildren(folderId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size)',
    orderBy: 'name',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 200,
  });
  return res.data.files || [];
}

function isImage(mimeType) {
  return mimeType.startsWith('image/');
}

function isVideo(mimeType) {
  return mimeType.startsWith('video/');
}

function isCaptionDoc(mimeType) {
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.google-apps.document'
  );
}

function extractCaptionSection(rawText) {
  const marker = /legenda\s*:/i;
  const match = rawText.match(marker);
  if (!match) return rawText.trim();
  return rawText.slice(match.index + match[0].length).trim();
}

async function extractCaptionFromDocx(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  const buffer = Buffer.from(res.data);
  const result = await mammoth.extractRawText({ buffer });
  return extractCaptionSection(result.value);
}

async function extractCaptionFromGoogleDoc(fileId) {
  const drive = getDrive();
  const res = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' },
  );
  return extractCaptionSection(String(res.data || ''));
}

// Resolve o conteúdo (mídia + legenda) de uma subpasta de post. Quando há
// mais de uma subpasta candidata com o mesmo prefixo (pastas duplicadas de
// rascunho no Drive), usa a que tiver mídia de fato — a vazia é ignorada.
async function resolvePostFolderContent(folder) {
  const children = await listChildren(folder.id);
  const mediaFiles = children.filter((f) => isImage(f.mimeType) || isVideo(f.mimeType));
  const captionFile = children.find((f) => isCaptionDoc(f.mimeType));

  let caption = null;
  if (captionFile) {
    try {
      caption =
        captionFile.mimeType === 'application/vnd.google-apps.document'
          ? await extractCaptionFromGoogleDoc(captionFile.id)
          : await extractCaptionFromDocx(captionFile.id);
    } catch (error) {
      caption = null;
    }
  }

  const video = mediaFiles.find((f) => isVideo(f.mimeType));
  const images = mediaFiles
    .filter((f) => isImage(f.mimeType))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const coverImage = images.find((f) => /capa/i.test(f.name)) || null;

  return {
    folderId: folder.id,
    folderName: folder.name,
    hasMedia: mediaFiles.length > 0,
    caption,
    media: video
      ? {
          type: 'video',
          files: [{ id: video.id, mimeType: video.mimeType }],
          coverImageId: coverImage?.id || null,
        }
      : { type: 'image', files: images.map((f) => ({ id: f.id, mimeType: f.mimeType })) },
  };
}

// Lista as subpastas de post dentro da pasta de artes do calendário, em
// ordem (Post 01, Post 02, ...), resolvendo duplicatas ao preferir a
// subpasta com mídia de fato quando o mesmo nome aparece mais de uma vez.
export async function listCalendarPostFolders(calendarFolderLink, { forceRefresh = false } = {}) {
  const folderId = extractFolderIdFromDriveLink(calendarFolderLink);
  if (!folderId) return [];

  const cacheKey = folderId;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < DRIVE_FOLDER_TTL_MS) {
    return cached.value;
  }

  const children = await listChildren(folderId);
  const subfolders = children.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');

  const contents = await Promise.all(subfolders.map((folder) => resolvePostFolderContent(folder)));

  const resolvedByName = new Map();
  subfolders.forEach((folder, index) => {
    const content = contents[index];
    const existing = resolvedByName.get(folder.name);
    if (!existing || (!existing.hasMedia && content.hasMedia)) {
      resolvedByName.set(folder.name, content);
    }
  });

  const result = [...resolvedByName.values()].sort((a, b) =>
    a.folderName.localeCompare(b.folderName, 'pt-BR', { numeric: true }),
  );

  cache.set(cacheKey, { value: result, at: Date.now() });
  return result;
}

// Usa fetch direto (em vez de drive.files.get com responseType: 'stream')
// porque o cliente googleapis/gaxios não expõe de forma confiável o status
// e os headers (Content-Range, Content-Length) da resposta em modo stream —
// e são justamente esses headers que o navegador precisa para fazer seek em
// vídeos grandes sem baixar o arquivo inteiro.
export async function getDriveFileStream(fileId, { range } = {}) {
  const accessToken = await getCachedAuth().getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(range ? { Range: range } : {}),
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Drive media request failed with status ${response.status}`);
  }

  return {
    stream: Readable.fromWeb(response.body),
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

export async function getDriveFileMetadata(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true,
  });
  return res.data;
}
