import { google } from 'googleapis';
import mammoth from 'mammoth';

const DRIVE_FOLDER_TTL_MS = 1000 * 60 * 5;
const cache = new Map();

function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE not configured');
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

let driveClient = null;
function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: 'v3', auth: getAuth() });
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
export async function listCalendarPostFolders(calendarFolderLink) {
  const folderId = extractFolderIdFromDriveLink(calendarFolderLink);
  if (!folderId) return [];

  const cacheKey = folderId;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < DRIVE_FOLDER_TTL_MS) {
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

export async function getDriveFileStream(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  return res.data;
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
