import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let wordList = null;

async function loadWords() {
  if (wordList) return wordList;
  const raw = await readFile(join(__dirname, '..', 'data', 'words.json'), 'utf8');
  wordList = JSON.parse(raw);
  return wordList;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Strategy 1: Short & catchy words + TLDs
export function* shortAndCatchy(tlds) {
  const words = shuffle(wordList ?? []);
  const shuffledTlds = shuffle(tlds);
  for (const word of words) {
    for (const tld of shuffledTlds) {
      yield `${word}${tld}`;
    }
  }
}

// Strategy 2: Keyword-based variations
const PREFIXES = ['get', 'try', 'use', 'hey', 'my', 'go', 'the', 'on', 'to', 'we', 'so', 'its', 'run', 'ask'];
const SUFFIXES = ['hq', 'app', 'dev', 'lab', 'hub', 'ly', 'ify', 'up', 'now', 'ai', 'io', 'os', 'run', 'go', 'pro', 'box', 'kit', 'ops'];

export function* keywordBased(keywords, tlds) {
  const shuffledKeywords = shuffle(keywords);
  const shuffledTlds = shuffle(tlds);

  for (const keyword of shuffledKeywords) {
    // bare keyword + TLD
    for (const tld of shuffledTlds) {
      yield `${keyword}${tld}`;
    }
    // prefix + keyword
    for (const prefix of shuffle(PREFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${prefix}${keyword}${tld}`;
      }
    }
    // keyword + suffix
    for (const suffix of shuffle(SUFFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${keyword}${suffix}${tld}`;
      }
    }
  }
}

// Strategy 3: Personal name variations
const NAME_PREFIXES = ['hey', 'ask', 'get', 'hi', 'by', 'its', 'im', 'the', 'yo', 'mr', 'dr', 'go'];
const NAME_SUFFIXES = ['hq', 'dev', 'lab', 'code', 'builds', 'works', 'tech', 'hub', 'ops', 'ai', 'app', 'run', 'pro', 'craft', 'zone', 'stack', 'verse', 'space'];

export function* personalNames(names, tlds) {
  const shuffledNames = shuffle(names);
  const shuffledTlds = shuffle(tlds);

  for (const name of shuffledNames) {
    // bare name
    for (const tld of shuffledTlds) {
      yield `${name}${tld}`;
    }
    // prefix + name
    for (const prefix of shuffle(NAME_PREFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${prefix}${name}${tld}`;
      }
    }
    // name + suffix
    for (const suffix of shuffle(NAME_SUFFIXES)) {
      for (const tld of shuffledTlds) {
        yield `${name}${suffix}${tld}`;
      }
    }
  }
}

// Strategy 4: Expired domains (checks public pending-delete lists)
export async function* expiredDomains(tlds) {
  // We generate random short combinations that are statistically likely
  // to include recently expired domains. True expired domain feeds
  // require paid access, so we approximate by checking very short/desirable names.
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const shuffledTlds = shuffle(tlds.filter(t => ['.com', '.net', '.org', '.dev', '.io'].includes(t)));

  // 3-letter combos
  const combos = [];
  for (let a = 0; a < 26; a++) {
    for (let b = 0; b < 26; b++) {
      for (let c = 0; c < 26; c++) {
        combos.push(`${chars[a]}${chars[b]}${chars[c]}`);
      }
    }
  }
  const shuffled = shuffle(combos);

  for (const combo of shuffled) {
    for (const tld of shuffledTlds) {
      yield `${combo}${tld}`;
    }
  }
}

// Main generator that cycles through all strategies
export async function* generateDomains(config) {
  await loadWords();

  const { keywords, personalNames: names, tlds, strategies } = config;

  const generators = [];

  if (strategies.includes('short')) {
    generators.push({ name: 'Short & Catchy', gen: shortAndCatchy(tlds) });
  }
  if (strategies.includes('keyword')) {
    generators.push({ name: 'Keyword-Based', gen: keywordBased(keywords, tlds) });
  }
  if (strategies.includes('personal')) {
    generators.push({ name: 'Alex-Themed', gen: personalNames(names, tlds) });
  }
  if (strategies.includes('expired')) {
    generators.push({ name: 'Short Combos', gen: expiredDomains(tlds) });
  }

  // Round-robin through strategies
  let activeGens = [...generators];
  while (activeGens.length > 0) {
    const nextActive = [];
    for (const { name, gen } of activeGens) {
      const result = await gen.next();
      if (!result.done) {
        yield { domain: result.value, strategy: name };
        nextActive.push({ name, gen });
      }
    }
    activeGens = nextActive;
  }
}
