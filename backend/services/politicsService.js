'use strict';

/**
 * Détection électorale déterministe, sans clé IA.
 *
 * Le dictionnaire est calibré sur la présidentielle française de 2027 et sur
 * les prises de position publiques de Sardoche (septembre-novembre 2026 :
 * meeting de Reconquête le 13 septembre, face-à-face YouTube avec Éric
 * Zemmour le 11 novembre, soutien affiché à David Lisnard).
 *
 * La détection est volontairement conservatrice côté thèmes : un mot-clé de
 * thème seul suffit (retraites, déficit, CSG, immigration…), car ce sont des
 * marqueurs fiables du débat public dans le flux de ce compte. Les noms de
 * candidats et de partis sont des signaux encore plus forts.
 *
 * Le ton (soutien / attaque / neutre) n'est PAS déterminé ici : le fallback
 * par mots-clés ne connaît que la présence, jamais l'intention. L'IA remplit
 * ce champ lors de l'analyse ; sans IA, la mention reste « neutre ».
 */

const MAX_MENTIONS = 8;
const MAX_LABEL_LENGTH = 80;

const MENTION_TYPES = ['candidat', 'parti', 'institution', 'personnalité'];
const MENTION_STANCES = ['soutien', 'attaque', 'neutre'];

// Mots-clés stockés sans accents, en minuscules.
// Leur correspondance préfixe (« candidat » détecte « candidats ») mais avec
// borne de mot : « rn » ne matche pas « tournant ».
const ELECTION_KEYWORDS = [
  'presidentielle',
  'presidentiel',
  'election',
  'europeennes',
  'candidat',
  'primaire',
  'second tour',
  'premier tour',
  'elysee',
  'parrainage',
  'scrutin',
  'urnes',
  'isoloir',
  'campagne presidentielle',
];

const THEME_KEYWORDS = [
  // Économie et dépense publique, chevaux de bataille du compte.
  'retraite',
  'pension',
  'deficit',
  'dette publique',
  'impot',
  'fiscal',
  'csg',
  'cotisation',
  'taxe',
  'tva',
  'smic',
  'pouvoir d\'achat',
  'chomage',
  'fonction publique',
  'capitalisation',
  'repartition',
  'socialisme',
  'socialiste',
  'communisme',
  'communiste',
  'marxisme',
  'marxiste',
  'liberalisme',
  'libertarien',
  'capitalisme',
  'plafonn',
  'entrepreneurs',
  'etat providence',
  // Institutions et vie publique.
  'assemblee nationale',
  'assemblee',
  'amendement',
  'parlement',
  'depute',
  'senat',
  'ministre',
  'gouvernement',
  'sondage',
  'vote',
  'immigration',
  'migrant',
  'titre de sejour',
  'liberte d\'expression',
  'censure',
  // Formules récurrentes du compte sur X.
  'vermine',
  'ensemble au pouvoir',
];

/**
 * Entités de la présidentielle 2027. L'ordre compte : les plus importantes
 * (candidats déclarés) sont résolues en premier, et le total est plafonné.
 */
const ENTITIES = [
  // Candidats déclarés ou en campagne (novembre 2026).
  {
    label: 'David Lisnard',
    type: 'candidat',
    keywords: ['lisnard'],
  },
  {
    label: 'Jean-Luc Mélenchon',
    type: 'candidat',
    keywords: ['melenchon'],
  },
  {
    label: 'Marine Le Pen',
    type: 'candidat',
    keywords: ['marine le pen', 'lepen', 'marine'],
  },
  {
    label: 'Éric Zemmour',
    type: 'candidat',
    keywords: ['zemmour'],
  },
  {
    label: 'Gabriel Attal',
    type: 'candidat',
    keywords: ['attal'],
  },
  {
    label: 'Bruno Retailleau',
    type: 'candidat',
    keywords: ['retailleau'],
  },
  {
    label: 'Édouard Philippe',
    type: 'candidat',
    keywords: ['edouard philippe'],
  },
  {
    label: 'Raphaël Glucksmann',
    type: 'candidat',
    keywords: ['glucksmann'],
  },
  {
    label: 'François Ruffin',
    type: 'candidat',
    keywords: ['ruffin'],
  },
  {
    label: 'Marine Tondelier',
    type: 'candidat',
    keywords: ['tondelier'],
  },
  {
    label: 'Fabien Roussel',
    type: 'candidat',
    keywords: ['roussel'],
  },
  {
    label: 'Nathalie Arthaud',
    type: 'candidat',
    keywords: ['arthaud'],
  },
  {
    label: 'Teddy Riner',
    type: 'candidat',
    keywords: ['riner'],
  },
  {
    label: 'Natacha Polony',
    type: 'candidat',
    keywords: ['polony'],
  },
  // Personnalités politiques citées sans être candidates (à ce jour).
  {
    label: 'Sarah Knafo',
    type: 'personnalité',
    keywords: ['knafo'],
  },
  {
    label: 'Jordan Bardella',
    type: 'personnalité',
    keywords: ['bardella'],
  },
  {
    label: 'Jean-Marie Le Pen',
    type: 'personnalité',
    keywords: ['jean-marie le pen', 'jean marie le pen', 'jmlp'],
  },
  {
    label: 'Mathilde Panot',
    type: 'personnalité',
    keywords: ['panot'],
  },
  {
    label: 'Emmanuel Macron',
    type: 'personnalité',
    keywords: ['macron'],
  },
  {
    label: 'François Hollande',
    type: 'personnalité',
    keywords: ['francois hollande', 'hollande'],
  },
  {
    label: 'Louis Boyard',
    type: 'personnalité',
    keywords: ['boyard'],
  },
  // Partis et mouvements.
  {
    label: 'La France insoumise',
    type: 'parti',
    keywords: ['la france insoumise', 'lfi', 'insoumis', 'insoumise'],
  },
  {
    label: 'Rassemblement national',
    type: 'parti',
    keywords: ['rassemblement national', 'rn'],
  },
  {
    label: 'Reconquête',
    type: 'parti',
    keywords: ['reconquete'],
  },
  {
    label: 'Les Républicains',
    type: 'parti',
    keywords: ['les republicains'],
  },
  {
    label: 'Renaissance',
    type: 'parti',
    keywords: ['renaissance'],
  },
  {
    label: 'Horizons',
    type: 'parti',
    keywords: ['horizons'],
  },
  {
    label: 'Nouvelle Énergie',
    type: 'parti',
    keywords: ['nouvelle energie'],
  },
  {
    label: 'Parti communiste',
    type: 'parti',
    keywords: ['parti communiste', 'pcf'],
  },
  {
    label: 'Lutte ouvrière',
    type: 'parti',
    keywords: ['lutte ouvriere'],
  },
  {
    label: 'Assemblée nationale',
    type: 'institution',
    keywords: ['assemblee nationale'],
  },
];

function normalizeText(content) {
  return String(content || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u02bc`´]/g, "'")
    .toLowerCase();
}

const keywordPatterns = new Map();

function keywordPattern(keyword) {
  if (!keywordPatterns.has(keyword)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    keywordPatterns.set(keyword, new RegExp(`(^|[^a-z0-9])${escaped}`));
  }
  return keywordPatterns.get(keyword);
}

function containsKeyword(normalizedText, keyword) {
  return keywordPattern(keyword).test(normalizedText);
}

/**
 * Un tweet est « politique » s'il mentionne l'élection, un candidat,
 * un parti, une institution ou un thème du débat public listé ici.
 */
function isPoliticalContent(content) {
  const text = normalizeText(content);
  if (!text.trim()) return false;

  return (
    ELECTION_KEYWORDS.some((keyword) => containsKeyword(text, keyword)) ||
    THEME_KEYWORDS.some((keyword) => containsKeyword(text, keyword)) ||
    ENTITIES.some((entity) =>
      entity.keywords.some((keyword) => containsKeyword(text, keyword))
    )
  );
}

/**
 * Personnalités, partis et institutions présents dans le texte.
 * Le ton est laissé à « neutre » : les mots-clés ne jugent pas l'intention.
 * Plafonné à MAX_MENTIONS entités, dans l'ordre du dictionnaire.
 */
function extractMentions(content) {
  const text = normalizeText(content);
  if (!text.trim()) return [];

  const mentions = [];

  for (const entity of ENTITIES) {
    if (mentions.length >= MAX_MENTIONS) break;

    const matched = entity.keywords.some((keyword) =>
      containsKeyword(text, keyword)
    );
    if (!matched) continue;

    if (mentions.some((mention) => mention.label === entity.label)) continue;

    mentions.push({
      label: String(entity.label).slice(0, MAX_LABEL_LENGTH),
      type: entity.type,
      stance: 'neutre',
    });
  }

  return mentions;
}

/**
 * Normalise les mentions produites par l'IA ou lues en base :
 * label nettoyé, type et ton validés, total plafonné.
 */
function normalizeMentions(value) {
  let source = value;

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  const seen = new Set();
  const mentions = [];

  for (const item of source) {
    if (mentions.length >= MAX_MENTIONS) break;
    if (!item || typeof item !== 'object') continue;

    const label = String(item.label || '').trim().slice(0, MAX_LABEL_LENGTH);
    if (!label || seen.has(label)) continue;

    const type = MENTION_TYPES.includes(item.type) ? item.type : 'personnalité';
    const stance = MENTION_STANCES.includes(item.stance)
      ? item.stance
      : 'neutre';

    seen.add(label);
    mentions.push({ label, type, stance });
  }

  return mentions;
}

module.exports = {
  MAX_MENTIONS,
  MENTION_TYPES,
  MENTION_STANCES,
  ELECTION_KEYWORDS,
  THEME_KEYWORDS,
  isPoliticalContent,
  extractMentions,
  normalizeMentions,
};
