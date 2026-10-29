const SCHEME = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_SCHEMES = 16;

// Catalog advertisements describe offers, not the buyer's current eligibility.
export function projectIndexterPaymentSchemes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(scheme => typeof scheme === 'string' && SCHEME.test(scheme)))].slice(0, MAX_SCHEMES);
}

export function isIndexterPaymentSchemes(value) {
  return Array.isArray(value) && value.length <= MAX_SCHEMES
    && value.every(scheme => typeof scheme === 'string' && SCHEME.test(scheme))
    && new Set(value).size === value.length;
}

export function indexterTabAdvertisementLabel(schemes) {
  return isIndexterPaymentSchemes(schemes) && schemes.includes('tab') ? 'Tabs advertised' : null;
}
