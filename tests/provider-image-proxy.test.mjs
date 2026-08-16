import assert from 'node:assert/strict';
import test from 'node:test';

import {
  providerFaviconUrl,
  providerImageSources,
  proxyProviderImageUrl,
} from '../apps-sdk/ui/src/components/x402/providerImage.ts';

test('provider images use only the Dexter image and favicon proxies', () => {
  assert.deepEqual(providerImageSources({
    iconUrl: 'https://icons.provider.example/service.svg?size=44',
    logoUrl: 'https://seller.example/logo.png',
    resourceUrl: 'https://api.seller.example/v1/price?asset=SOL',
  }), [
    'https://api.dexter.cash/api/img?url=https%3A%2F%2Ficons.provider.example%2Fservice.svg%3Fsize%3D44',
    'https://api.dexter.cash/api/img?url=https%3A%2F%2Fseller.example%2Flogo.png',
    'https://dexter.cash/api/favicon?domain=api.seller.example',
  ]);
});

test('provider image helpers reject executable, embedded, credentialed, and malformed URLs', () => {
  for (const value of [
    'data:image/png;base64,abc',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:secret@example.com/icon.png',
    'not a URL',
    '',
    null,
  ]) {
    assert.equal(proxyProviderImageUrl(value), null, String(value));
  }
  assert.equal(providerFaviconUrl('javascript:alert(1)'), null);
  assert.deepEqual(providerImageSources({
    iconUrl: 'data:image/png;base64,abc',
    resourceUrl: 'not a URL',
  }), []);
});

test('an existing canonical Dexter image proxy URL is not wrapped twice', () => {
  const existing =
    'https://api.dexter.cash/api/img?url=https%3A%2F%2Fprovider.example%2Ficon.png';
  assert.equal(proxyProviderImageUrl(existing), existing);
});
