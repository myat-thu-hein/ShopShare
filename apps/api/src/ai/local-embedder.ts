/**
 * A free, offline text embedder (no API key, no model download).
 *
 * It uses the "hashing trick": every word, word pair and 3-letter chunk is hashed into one
 * of 768 slots. Texts that share words and word-parts end up pointing in similar directions,
 * so cosine similarity works for search and "similar products". It is weaker than a neural
 * embedding model at understanding meaning, so a small synonym table helps it with common
 * shopping phrases. Switch EMBEDDING_PROVIDER=openai for neural embeddings.
 */

export const EMBEDDING_DIM = 768;
export const LOCAL_EMBEDDING_MODEL = 'local-hash-v1';

const STOPWORDS = new Set(
  'a an and are as at be but by for from has have i in is it its me my of on or our so that the this to was with you your under over below above than less more want need looking find show some any good best cheap'.split(
    ' ',
  ),
);

/** Maps shopper vocabulary onto the words our catalogue uses. */
const SYNONYMS: Record<string, string> = {
  sneaker: 'shoe',
  sneakers: 'shoe',
  trainer: 'shoe',
  trainers: 'shoe',
  shoes: 'shoe',
  footwear: 'shoe',
  runner: 'running',
  run: 'running',
  jogging: 'running',
  jog: 'running',
  marathon: 'running',
  tee: 'tshirt',
  't-shirt': 'tshirt',
  shirt: 'tshirt',
  raincoat: 'rain jacket',
  coat: 'jacket',
  notebook: 'laptop',
  earphones: 'earbuds',
  earphone: 'earbuds',
  headset: 'headphones',
  mobile: 'smartphone',
  phone: 'smartphone',
  wide: 'wide fit',
  broad: 'wide fit',
  watertight: 'waterproof',
  'water-proof': 'waterproof',
  grey: 'grey',
  gray: 'grey',
  colour: 'colour',
  color: 'colour',
  skincare: 'skincare',
  moisturizer: 'moisturiser',
  sunblock: 'sunscreen',
  camping: 'camping',
  gym: 'gym',
  workout: 'gym',
};

export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9฀-๿\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let t of raw) {
    if (STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
    const syn = SYNONYMS[t];
    if (syn) {
      out.push(...syn.split(' '));
      continue;
    }
    // light stemming: shoes -> shoe, boxes -> box
    if (t.length > 4 && t.endsWith('es') && !t.endsWith('ses')) t = t.slice(0, -2);
    else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
    out.push(t);
  }
  return out;
}

/** FNV-1a 32-bit hash. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function addFeature(vec: Float64Array, feature: string, weight: number) {
  const h = fnv1a(feature);
  const index = h % EMBEDDING_DIM;
  const sign = (h >>> 31) & 1 ? -1 : 1;
  vec[index] += sign * weight;
}

export function localEmbed(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIM);
  const tokens = tokenize(text);
  tokens.forEach((t, i) => {
    addFeature(vec, `w:${t}`, 1);
    if (i > 0) addFeature(vec, `b:${tokens[i - 1]}_${t}`, 0.6);
    const padded = `^${t}$`;
    for (let j = 0; j + 3 <= padded.length; j++) addFeature(vec, `c:${padded.slice(j, j + 3)}`, 0.25);
  });
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => Number((v / norm).toFixed(6)));
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
