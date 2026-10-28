export const INDEXTER_MAX_QUERY_CODE_UNITS = 1_024;
const MAX_PROVIDER_CODE_POINTS = 80;

const OVERVIEW_ROUTE = Object.freeze({ route: 'overview', provider: null });
const TASK_ROUTE = Object.freeze({ route: 'task', provider: null });

const OVERVIEW_PROMPTS = new Set([
  'find things to do',
  'what should i try',
  'surprise me',
  'what can i do',
  'what is available',
  "what's available",
  'show me what is available',
  "show me what's available",
  'browse indexter',
  'explore indexter',
]);

const INDEXTER_NAMES = new Set([
  'dexter',
  'dexter wallet',
  'indexter',
  'open dexter',
  'opendexter',
]);

const GENERIC_PROVIDER_REFERENCES = new Set([
  'a company',
  'a provider',
  'a service',
  'an api',
  'api',
  'apis',
  'any company',
  'any provider',
  'any service',
  'capabilities',
  'catalog',
  'company',
  'companies',
  'offerings',
  'provider',
  'providers',
  'service',
  'services',
  'some company',
  'some provider',
  'some service',
  'that company',
  'that provider',
  'that service',
  'this company',
  'this provider',
  'this service',
  'tool',
  'tools',
  'you',
]);

const AMBIGUOUS_TASK_OBJECTS = new Set([
  'an api',
  'api',
  'anything',
  'apis',
  'data',
  'options',
  'provider',
  'providers',
  'service',
  'services',
  'something',
  'stuff',
  'things',
  'tool',
  'tools',
]);

const GENERIC_TASK_WORDS = new Set([
  'a', 'an', 'and', 'any', 'api', 'apis', 'can', 'could', 'data', 'do', 'for',
  'from', 'help', 'i', 'is', 'me', 'need', 'of', 'on', 'option', 'options',
  'please', 'provider', 'providers', 'service', 'services', 'something', 'that',
  'the', 'there', 'thing', 'things', 'to', 'tool', 'tools', 'want', 'with',
  'would', 'you',
]);

const KEYWORD_TASK_STOP_WORDS = new Set([
  ...GENERIC_TASK_WORDS,
  'at', 'by', 'in', 'near', 'or', 'per', 'using', 'current', 'latest', 'live',
]);

const GENERIC_TASK_CATEGORIES = new Set([
  'analytics',
  'crypto',
  'data',
  'finance',
  'image',
  'images',
  'maps',
  'news',
  'stock',
  'stocks',
  'summarization',
  'translation',
  'travel',
  'weather',
  'sports', 'restaurants', 'cybersecurity', 'legal', 'education',
  'image generation', 'social media', 'web scraping', 'blockchain analytics',
  'travel planning', 'wallet analytics', 'stock data',
]);

function unwrapRequest(query) {
  return query
    .replace(/^(?:please\s+)?(?:can|could|would|will) you\s+/iu, '')
    .replace(/^(?:please\s+)?(?:i|we)\s+(?:want|would like|need)\s+to\s+/iu, '')
    .replace(/^(?:please\s+)?help me\s+/iu, '');
}

const PROVIDER_PATTERNS = Object.freeze([
  /^(?:please\s+)?what can i do with\s+(.+?)\s*[?!.]*$/iu,
  /^(?:please\s+)?what (?:does|can)\s+(.+?)\s+(?:offer|provide|do|have)\s*[?!.]*$/iu,
  /^(?:please\s+)?what (?:apis?|offerings?|services?|capabilities|tools?) (?:does|can)\s+(.+?)\s+(?:offer|provide|have)\s*[?!.]*$/iu,
  /^(?:please\s+)?which (?:apis?|offerings?|services?|capabilities|tools?) (?:does|can)\s+(.+?)\s+(?:offer|provide|have)\s*[?!.]*$/iu,
  /^(?:please\s+)?(?:tell|show) me what\s+(.+?)\s+(?:offers|provides|has)\s*[?!.]*$/iu,
  /^(?:please\s+)?show me\s+(.+?)\s+(?:apis?|offerings?|services?|capabilities|tools?|models?|catalog)\s*[?!.]*$/iu,
  /^(?:please\s+)?show me\s+(?:apis?|offerings?|services?|capabilities|tools?|models?|catalog)\s+(?:from|for|by)\s+(.+?)\s*[?!.]*$/iu,
  /^(?:please\s+)?(?:find|list)\s+(?:me\s+)?(.+?)\s+(?:apis?|offerings?|services?|capabilities|tools?|models?|catalog)\s*[?!.]*$/iu,
  /^(?:please\s+)?(?:find|list)\s+(?:me\s+)?(?:apis?|offerings?|services?|capabilities|tools?|models?|catalog)\s+(?:from|for|by)\s+(.+?)\s*[?!.]*$/iu,
  /^(?:please\s+)?(?:apis?|offerings?|services?|capabilities|tools?|models?|catalog)\s+(?:from|for|by)\s+(.+?)\s*[?!.]*$/iu,
  /^(?:please\s+)?(?:browse|explore)\s+(.+?)(?:\s+(?:apis?|offerings?|services?|capabilities|tools?|models?|catalog))?\s*[?!.]*$/iu,
  /^(?:please\s+)?(.+?)\s+(?:apis?|offerings?|services?|capabilities|tools?|models?|catalog)\s*[?!.]*$/iu,
]);

const PROVIDER_CHARACTERS = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .&'’+_-]*$/u;
const UNSAFE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udfff]/u;
const INSTRUCTION_LIKE_TEXT = /(?:<\|[^>]*\|>|\[\/?inst\]|(?:system|developer|assistant)\s*:|\b(?:ignore|disregard|override|bypass)\b.{0,40}\b(?:instructions?|messages?|rules?|prompt)\b|\b(?:reveal|print|repeat)\b.{0,30}\b(?:system|developer)\s+(?:prompt|message)\b|\b(?:execute|call|invoke)\b.{0,24}\b(?:tool|function|command)\b)/iu;
const INSTRUCTION_LIKE_PROVIDER = /\b(?:assistant|bypass|call|delete|developer|disregard|execute|ignore|instructions?|invoke|override|prompt|route|system)\b/iu;

function normalizeQuery(value) {
  if (typeof value !== 'string' || value.length > INDEXTER_MAX_QUERY_CODE_UNITS) return null;

  let normalized;
  try {
    normalized = value.normalize('NFKC');
  } catch {
    return null;
  }

  if (
    UNSAFE_CONTROL.test(normalized)
    || UNPAIRED_SURROGATE.test(normalized)
    || normalized.length > INDEXTER_MAX_QUERY_CODE_UNITS
  ) {
    return null;
  }

  normalized = normalized.replace(/\s+/gu, ' ').trim();
  return normalized || null;
}

// Keep the original utterance available to the same routing boundary when the
// model resolves a conversational follow-up into a standalone search query.
function originalQueryAllowsRouting(value) {
  if (value === undefined) return true;
  const original = normalizeQuery(value);
  return original !== null && !INSTRUCTION_LIKE_TEXT.test(original);
}

function withoutTerminalPunctuation(value) {
  return value.replace(/[\s?!.]+$/gu, '').trim();
}

function unwrapProvider(value) {
  let provider = withoutTerminalPunctuation(value).trim();
  provider = provider.replace(/\s+(?:for me|please)$/iu, '').trim();
  const wrappers = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ];

  for (const [left, right] of wrappers) {
    if (provider.startsWith(left) && provider.endsWith(right)) {
      provider = provider.slice(left.length, -right.length).trim();
      break;
    }
  }

  return provider;
}

function safeProvider(value) {
  const quotedCandidate = withoutTerminalPunctuation(value)
    .replace(/\s+(?:for me|please)$/iu, '')
    .trim();
  const explicitlyQuoted = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ].some(([left, right]) => (
    quotedCandidate.startsWith(left) && quotedCandidate.endsWith(right)
  ));
  const provider = unwrapProvider(value);
  const lower = provider.toLowerCase();
  const words = provider.split(/\s+/u);

  if (
    !provider
    || [...provider].length > MAX_PROVIDER_CODE_POINTS
    || words.length > 8
    || !PROVIDER_CHARACTERS.test(provider)
    || INSTRUCTION_LIKE_PROVIDER.test(provider)
    || INDEXTER_NAMES.has(lower)
    || GENERIC_PROVIDER_REFERENCES.has(lower)
    || (
      !explicitlyQuoted
      && /^(?:a|an|any|some|the)\s+.+\b(?:apis?|companies|company|data|providers?|services?|tools?)$/iu.test(lower)
    )
  ) {
    return null;
  }

  return provider;
}

function extractProvider(query) {
  // A capability qualifier is not part of a provider's catalog identity.
  // Keep this candidate inert: the handler still resolves it against the API.
  const qualified = /^(?:(?:show me|find|list|browse|explore)\s+)?(.+?)\s+data\s+(?:offerings?|services?|apis?)\s*[?!.]*$/iu.exec(query);
  if (qualified) {
    const words = qualified[1].split(/\s+/u);
    const firstQualifier = words.findIndex((word) => {
      const letter = word.match(/\p{L}/u)?.[0];
      return letter && letter !== letter.toLocaleUpperCase() && !word.includes('.');
    });
    if (firstQualifier > 0) {
      const candidate = safeProvider(words.slice(0, firstQualifier).join(' '));
      if (candidate && !/^(?:find|get|give|show|fetch|compare|search|recommend|buy)$/iu.test(candidate)) return candidate;
    }
  }
  for (const pattern of PROVIDER_PATTERNS) {
    const match = pattern.exec(query);
    if (!match) continue;
    return safeProvider(match[1]);
  }
  return null;
}

function isExplicitNamedProvider(query, provider, providerNames = []) {
  const lower = provider.toLowerCase();
  if (providerNames.some((name) => typeof name === 'string' && name.normalize('NFKC').trim().toLowerCase() === lower)) return true;
  if (GENERIC_TASK_CATEGORIES.has(lower)) return false;

  if (
    /[.]/u.test(provider)
    || /["'“”‘’]/u.test(query)
    || /\s(?:from|by)\s+.+?\s*[?!.]*$/iu.test(query)
  ) {
    return true;
  }

  const words = provider.split(/\s+/u);
  const nameShaped = words.every((word) => {
    const firstLetter = word.match(/\p{L}/u)?.[0];
    return !firstLetter || firstLetter === firstLetter.toLocaleUpperCase();
  });
  if (nameShaped) return true;

  // Weak browse/list phrasing plus an unquoted lowercase noun is a category
  // request ("Browse sports", "show me legal services"), not enough evidence
  // to manufacture a merchant identity. A one-word lowercase candidate is
  // provider-shaped only in an explicit question about what it offers.
  return words.length === 1 && (
    /^(?:please\s+)?what can i do with\s+/iu.test(query)
    || /^(?:please\s+)?what (?:does|can)\s+/iu.test(query)
    || /^(?:please\s+)?(?:tell|show) me what\s+/iu.test(query)
  );
}

function isOverview(query) {
  const lower = withoutTerminalPunctuation(query).toLowerCase();
  if (OVERVIEW_PROMPTS.has(lower)) return true;
  // Match a complete browsing request, never a substring of a concrete job
  // such as "Amazon best sellers" or "best historical BTC data".
  if (/^(?:please\s+)?(?:(?:show me|give me|browse|explore|find|list|suggest|recommend|what are|which are|what|which)\s+)?(?:(?:the|your|all|some|more)\s+)*(?:featured|popular|curated|top|best)(?:\s+x402)?\s+(?:providers?|sellers?|services?|apis?|tools?|offerings?)(?:\s+(?:on|in|from)\s+(?:indexter|opendexter|dexter))?$/iu.test(lower)) return true;
  if (/^(?:(?:i|we)\s+(?:need|want|would like|am looking for|are looking for)|(?:is|are) there(?:\s+(?:an?|any))?)\s+(?:an?\s+|any\s+|some\s+|the\s+)?(?:help|options?|providers?|services?|tools?)$/iu.test(lower)) {
    return true;
  }
  if (/^(?:browse|explore|find|list|show me)\s+(?:available\s+)?(?:apis?|catalog|offerings?|providers?|services?|tools?)$/iu.test(lower)) {
    return true;
  }
  const productCatalog = /^(?:browse|explore)\s+(.+?)\s+(?:apis?|catalog|providers?|services?|tools?)$/iu.exec(lower);
  if (productCatalog && INDEXTER_NAMES.has(productCatalog[1].trim())) return true;

  const productQuestion = /^what can i do with\s+(.+)$/iu.exec(lower);
  return productQuestion ? INDEXTER_NAMES.has(productQuestion[1].trim()) : false;
}

function isConcreteTask(query) {
  const lower = withoutTerminalPunctuation(query).toLowerCase();

  if (/^find\s+things?\s+to\s+do\s+(?:in|near|around|for)\s+\S/iu.test(lower)) {
    return true;
  }
  if (/^(?:current|live|latest|today(?:'s)?)\s+weather\s+(?:for|in|at|near)\s+\S/iu.test(lower)) {
    return true;
  }
  if (/^translate\s+.+\s+(?:to|into)\s+\S/iu.test(lower)) return true;
  if (/^(?:generate|create|make)\s+(?:me\s+)?\S.+/iu.test(lower)) return true;
  if (/^surprise me with\s+\S.+/iu.test(lower)) return true;
  if (/^show me\s+.+\b(?:apis?|data|results?|prices?|weather|news|images?)\b/iu.test(lower)) {
    return true;
  }
  if (/^(?:browse|explore|list)(?:\s+me)?\s+.+\b(?:apis?|services?|tools?)$/iu.test(lower)) {
    return true;
  }
  if (/^(?:what|which)\s+(?:apis?|services?|tools?)\s+can\s+\S.+/iu.test(lower)) {
    return true;
  }
  if (/\b(?:weather|things? to do)\s+(?:for|in|at|near|around)\s+\S/iu.test(lower)) {
    return true;
  }

  let request = lower;
  let hadRequestWrapper = false;
  const wrappers = [
    /^(?:please\s+)?(?:can|could|would|will) you\s+/iu,
    /^(?:please\s+)?help me\s+/iu,
    /^(?:please\s+)?(?:i|we)\s+(?:need|want|would like|am looking for|are looking for)\s+/iu,
    /^(?:please\s+)?(?:is|are) there\s+(?:an?|any)\s+/iu,
    /^please\s+/iu,
  ];
  for (const wrapper of wrappers) {
    const unwrapped = request.replace(wrapper, '');
    if (unwrapped !== request) {
      request = unwrapped.trim();
      hadRequestWrapper = true;
      break;
    }
  }

  const action = /^(?:analy[sz]e|book|buy|calculate|check|collect|compare|convert|create|download|extract|fetch|find|generate|get|list|look up|make|monitor|search(?: for)?|scrape|send|summarize|translate|verify)\s+(?:me\s+)?(.+)$/iu.exec(request);
  if (action) {
    const object = action[1].replace(/^(?:a|an|any|some|the)\s+/u, '').trim();
    return object.length >= 3 && !AMBIGUOUS_TASK_OBJECTS.has(object);
  }

  if (hadRequestWrapper) {
    const requestedOutcomeWords = request
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 2 && !GENERIC_TASK_WORDS.has(word));
    if (requestedOutcomeWords.length >= 1) return true;
  }

  const framedService = /^(?:an?\s+)?(?:apis?|services?|tools?)\s+(?:for|that(?:\s+can)?|to)\s+(.+)$/iu.exec(request);
  const serviceNeed = /^(?:an?\s+)?(.+?)\s+(?:apis?|services?|tools?)(?:\s+.+)?$/iu.exec(request);
  const object = framedService?.[1]
    ?? (
      serviceNeed && (hadRequestWrapper || !/^(?:how|what|when|where|which|who|why)\b/iu.test(request))
        ? serviceNeed[1]
        : null
    );
  if (!object) return false;
  const meaningfulWords = object
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2 && !GENERIC_TASK_WORDS.has(word));
  return meaningfulWords.length > 0;
}

function isKeywordTask(query) {
  const lower = withoutTerminalPunctuation(query).toLowerCase();
  // Unresolved follow-ups and conversational requests still use the explicit
  // patterns above. This fallback is for noun phrases such as "PDF extraction".
  if (/^(?:what|which|who|why|when|where|how|can|could|would|will|should|do|does|did|is|are|i|we|you|it|they|please|help|find|show|browse|explore|list)\b/u.test(lower)) {
    return false;
  }
  if (/^(?:this|that|these|those|same|other|another|more|again)(?:\s|$)/u.test(lower)) {
    return false;
  }
  const terms = new Set(lower
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => (
      word.length >= 2 && /\p{L}/u.test(word) && !KEYWORD_TASK_STOP_WORDS.has(word)
    )));
  return terms.size >= 2;
}

function providerCandidateFromRequest(request) {
  const capabilityQuestion = /^(?:does|can)\s+(.+?)\s+(?:have|offer|provide|support|do)\s+\S.+[?!.]*$/iu.exec(request);
  return extractProvider(request)
    ?? (capabilityQuestion ? safeProvider(capabilityQuestion[1]) : null);
}

function bareProviderCandidate(request) {
  const candidate = safeProvider(request);
  if (!candidate || GENERIC_TASK_CATEGORIES.has(candidate.toLowerCase())
    || KEYWORD_TASK_STOP_WORDS.has(candidate.toLowerCase())) return null;
  const quoted = /^(?:"[^"\n]+"|'[^'\n]+'|“[^”\n]+”|‘[^’\n]+’)[?!.]*$/u.test(request);
  // A bare identifier is a catalog lookup candidate, not a guessed provider.
  // Multiword requests retain task semantics unless the name is quoted.
  return quoted || !/\s/u.test(candidate) ? candidate : null;
}

/** Candidate for an authoritative catalog lookup, never an inferred identity. */
export function getIndexterProviderCandidate(value, { originalQuery, taskConstraints = false } = {}) {
  if (taskConstraints) return null;
  if (!originalQueryAllowsRouting(originalQuery)) return null;
  const query = normalizeQuery(value);
  if (!query || INSTRUCTION_LIKE_TEXT.test(query) || isOverview(query)) return null;
  const request = unwrapRequest(query);
  const candidate = providerCandidateFromRequest(request)
    ?? bareProviderCandidate(request);
  return candidate && !GENERIC_TASK_CATEGORIES.has(candidate.toLowerCase())
    ? candidate
    : null;
}

/** A literal name may be probed, but only the catalog's complete name can accept it. */
export function getIndexterPublishedNameCandidate(value, { originalQuery, taskConstraints = false } = {}) {
  if (taskConstraints || !originalQueryAllowsRouting(originalQuery)) return null;
  const query = normalizeQuery(value);
  if (!query || INSTRUCTION_LIKE_TEXT.test(query) || isOverview(query) || isConcreteTask(query)) return null;
  if (/^(?:this|that|these|those|same|other|another|more|again|what|which|who|why|when|where|how)(?:\s|$)/iu.test(query)) return null;
  const candidate = safeProvider(query);
  if (!candidate || GENERIC_TASK_CATEGORIES.has(candidate.toLowerCase())) return null;
  const words = candidate.split(/\s/u);
  return words.length >= 2 && words.length <= 4 ? candidate : null;
}

export function matchesIndexterPublishedName(candidate, payload) {
  const normalize = (value) => typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
    : null;
  const target = normalize(candidate);
  return Boolean(target) && payload?.ok === true && payload.mode === 'provider'
    && Array.isArray(payload.providers) && payload.providers.length === 1
    && normalize(payload.providers[0]?.displayName) === target;
}

/**
 * Classify one natural-language Indexter request without consulting mutable state.
 * Provider output is inert display/query data; callers must never execute it.
 *
 * @param {unknown} value
 * The detailed result explains the selected branch without changing dispatch.
 */
export function classifyIndexterRequest(value, { providerNames = [], originalQuery, taskConstraints = false } = {}) {
  const explain = (decision, routingReason) => Object.freeze({ ...decision, routingReason });
  if (!originalQueryAllowsRouting(originalQuery)) return explain(OVERVIEW_ROUTE, 'input_rejected');
  const query = normalizeQuery(value);
  if (!query || INSTRUCTION_LIKE_TEXT.test(query)) return explain(OVERVIEW_ROUTE, 'input_rejected');
  if (taskConstraints) return explain(TASK_ROUTE, 'task_query');
  if (isOverview(query)) return explain(OVERVIEW_ROUTE, 'overview_requested');

  const request = unwrapRequest(query);
  const knownBareProvider = safeProvider(request);
  if (knownBareProvider && providerNames.some((name) => typeof name === 'string'
    && name.normalize('NFKC').trim().toLowerCase() === knownBareProvider.toLowerCase())) {
    return explain({ route: 'provider', provider: knownBareProvider }, 'provider_requested');
  }
  // A capability question asks about a provider's offerings; an imperative
  // such as 'scrape with Apify' still describes a concrete job.
  const provider = providerCandidateFromRequest(request);
  if (provider && isExplicitNamedProvider(request, provider, providerNames)) {
    return explain({ route: 'provider', provider }, 'provider_requested');
  }
  if (isConcreteTask(query)) return explain(TASK_ROUTE, 'task_query');
  if (provider) return explain(TASK_ROUTE, 'task_query');
  if (isKeywordTask(query)) return explain(TASK_ROUTE, 'task_query');
  return explain(OVERVIEW_ROUTE, 'unresolved_query');
}

/** These controls are implemented by task search, never by the directory. */
export function hasIndexterTaskConstraints(args = {}) {
  return ['network', 'maxPriceUsdc', 'minPriceUsdc', 'paidOnly', 'sortBy',
    'unverified', 'testnets', 'rerank'].some((key) => args[key] !== undefined);
}

/** Preserve the original strict route/provider contract for existing callers. */
export function routeIndexterRequest(value, options) {
  const { route, provider } = classifyIndexterRequest(value, options);
  if (route === 'overview') return OVERVIEW_ROUTE;
  if (route === 'task') return TASK_ROUTE;
  return Object.freeze({ route, provider });
}
