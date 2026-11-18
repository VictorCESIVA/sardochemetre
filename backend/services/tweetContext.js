'use strict';

const axios = require('axios');

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 15000;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function authorLabel(author) {
  if (!author) return 'auteur inconnu';
  if (author.username) return `@${author.username}`;
  return author.name || 'auteur inconnu';
}

function imageCandidates(tweet) {
  if (!tweet || typeof tweet !== 'object') return [];

  const sources = [
    ['tweet', tweet.media],
    ['citation', tweet.quoted_tweet && tweet.quoted_tweet.media],
    ['réponse', tweet.reply_to && tweet.reply_to.media],
  ];
  const seen = new Set();
  const candidates = [];

  for (const [origin, media] of sources) {
    if (!Array.isArray(media)) continue;

    for (const item of media) {
      if (!item || item.type !== 'photo' || !item.url) continue;

      const url = String(item.url);
      if (seen.has(url)) continue;
      seen.add(url);

      candidates.push({
        url,
        alt: item.alt ? String(item.alt) : '',
        origin,
      });
    }
  }

  return candidates;
}

/**
 * Texte envoyé au modèle : tweet, contexte de réponse, citation et aperçu
 * textuel des images. Le tweet reste une donnée, jamais une instruction.
 */
function buildAnalysisPrompt(content, tweet = null, { withImages = true } = {}) {
  const text = String(content || '').trim();
  const sections = [`Tweet à analyser :\n${text}`];

  if (tweet && tweet.reply_to && tweet.reply_to.content) {
    sections.push(
      `Tweet auquel ce tweet répond (${authorLabel(
        tweet.reply_to.author
      )}) :\n${String(tweet.reply_to.content).trim()}`
    );
  }

  if (tweet && tweet.quoted_tweet && tweet.quoted_tweet.content) {
    sections.push(
      `Tweet cité (${authorLabel(tweet.quoted_tweet.author)}) :\n${String(
        tweet.quoted_tweet.content
      ).trim()}`
    );
  }

  const candidates = imageCandidates(tweet).slice(0, MAX_IMAGES);
  if (withImages && candidates.length > 0) {
    sections.push(
      'Des images sont jointes au tweet ou à son contexte. Lis leur contenu ' +
        '(texte visible, graphiques, captures d’écran) et appuie ton analyse ' +
        'dessus quand c’est pertinent.'
    );
  }

  const descriptions = candidates
    .map((candidate, index) =>
      candidate.alt
        ? `- Image ${index + 1} (${candidate.origin}) : ${candidate.alt}`
        : null
    )
    .filter(Boolean);

  if (descriptions.length > 0) {
    sections.push(`Description fournie par X :\n${descriptions.join('\n')}`);
  }

  return sections.join('\n\n');
}

function inferImageType(url) {
  const pathname = String(url || '')
    .split('?')[0]
    .toLowerCase();

  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.gif')) return 'image/gif';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return '';
}

function normalizeImageUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (
      parsed.hostname.endsWith('twimg.com') &&
      (parsed.pathname.includes('/media/') ||
        parsed.pathname.includes('/amplify_video_thumb/'))
    ) {
      parsed.searchParams.set('name', 'large');
    }
    return parsed.toString();
  } catch {
    return String(url);
  }
}

async function downloadImage(url) {
  const response = await axios.get(normalizeImageUrl(url), {
    responseType: 'arraybuffer',
    timeout: IMAGE_TIMEOUT_MS,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
    },
  });

  const contentType = String(
    (response.headers && response.headers['content-type']) || ''
  )
    .split(';')[0]
    .trim()
    .toLowerCase();
  const mediaType = SUPPORTED_IMAGE_TYPES.has(contentType)
    ? contentType
    : inferImageType(url);

  if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
    throw new Error(`format d'image non supporté (${contentType || 'inconnu'})`);
  }

  const buffer = Buffer.from(response.data);
  if (buffer.length === 0) throw new Error('image vide');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`image trop lourde (${buffer.length} octets)`);
  }

  return {
    mediaType,
    data: buffer.toString('base64'),
    bytes: buffer.length,
  };
}

/**
 * Télécharge jusqu'à quatre images du tweet et de son contexte.
 * Une image inaccessible est ignorée : le texte reste analysé.
 */
async function loadTweetImages(
  tweet,
  { fetchImage = downloadImage } = {}
) {
  const candidates = imageCandidates(tweet).slice(0, MAX_IMAGES);
  const images = [];

  for (const candidate of candidates) {
    try {
      const image = await fetchImage(candidate.url);
      images.push({
        ...image,
        url: candidate.url,
        alt: candidate.alt,
        origin: candidate.origin,
      });
    } catch (error) {
      console.error(
        `[IA] Image ignorée (${candidate.url}) : ${error.message}`
      );
    }
  }

  return images;
}

function toOpenAiImageParts(images) {
  return images.map((image) => ({
    type: 'image_url',
    image_url: {
      url: `data:${image.mediaType};base64,${image.data}`,
    },
  }));
}

function toAnthropicImageBlocks(images) {
  return images.map((image) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.mediaType,
      data: image.data,
    },
  }));
}

module.exports = {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  SUPPORTED_IMAGE_TYPES,
  authorLabel,
  imageCandidates,
  buildAnalysisPrompt,
  normalizeImageUrl,
  downloadImage,
  loadTweetImages,
  toOpenAiImageParts,
  toAnthropicImageBlocks,
};
