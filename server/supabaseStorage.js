import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'media-variants';

let client = null;
function getClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
    }
    client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export function mediaVariantStoragePath(fileId, variant) {
  return `variants/${fileId}/${variant}.webp`;
}

export async function uploadVariant(path, buffer, contentType) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}

// URL assinada de curta duração -- o bucket é privado, então o acesso real
// (autorização por token/sessão) já aconteceu antes, na rota que chama isso.
// Cacheada por um TTL menor que expiresInSeconds: a mesma variante é pedida
// repetidamente (revisitar o post, thumbs do feed) e sem isso cada request
// pagava outra chamada de rede ao Storage só para reassinar a mesma URL.
const signedUrlCache = new Map();

export async function getSignedUrl(path, expiresInSeconds = 300) {
  const cacheKeyTtlMs = (expiresInSeconds - 30) * 1000;
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() - cached.at < cacheKeyTtlMs) {
    return cached.value;
  }

  const supabase = getClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;

  signedUrlCache.set(path, { value: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

export async function removeVariants(paths) {
  if (!paths || paths.length === 0) return;
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}
