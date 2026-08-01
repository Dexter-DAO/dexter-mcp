import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { selectPaymentRequirement } from '../clients/selectPaymentRequirement.mjs';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const IOTEX_USDC = '0xcdf79194c6c285077a58da47641d4dbe51f63542';

test('hosted server does not install the legacy browser-wallet x402 graph', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const lock = JSON.parse(
    await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
  );
  const clientSource = await readFile(
    new URL('../clients/x402Client.mjs', import.meta.url),
    'utf8',
  );

  assert.equal(packageJson.dependencies.x402, undefined);
  assert.doesNotMatch(clientSource, /from ['"]x402(?:\/client)?['"]/);
  assert.match(clientSource, /selectPaymentRequirement/);
  assert.equal(lock.packages?.['node_modules/x402'], undefined);
  for (const packagePath of Object.keys(lock.packages ?? {})) {
    assert.doesNotMatch(
      packagePath,
      /^node_modules\/(?:@reown\/|@wagmi\/|@walletconnect\/|wagmi$)/,
      `legacy x402 browser dependency remained in lock: ${packagePath}`,
    );
  }
});

test('selection preserves legacy base-first, exact, and USDC behavior', () => {
  const accepts = [
    { network: 'solana', scheme: 'exact', asset: SOLANA_USDC, id: 'solana' },
    { network: 'base', scheme: 'exact', asset: BASE_USDC, id: 'base-usdc' },
    { network: 'base', scheme: 'exact', asset: '0xother', id: 'base-other' },
  ];

  assert.equal(
    selectPaymentRequirement(accepts, ['solana', 'base'], 'exact').id,
    'base-usdc',
  );
  assert.deepEqual(
    accepts.map(({ id }) => id),
    ['solana', 'base-usdc', 'base-other'],
    'selection must not reorder the caller-owned challenge',
  );
});

test('selection filters by scheme and requested network', () => {
  const accepts = [
    { network: 'base', scheme: 'upto', asset: BASE_USDC, id: 'wrong-scheme' },
    { network: 'solana', scheme: 'exact', asset: SOLANA_USDC, id: 'solana' },
  ];

  assert.equal(
    selectPaymentRequirement(accepts, 'solana', 'exact').id,
    'solana',
  );
});

test('selection preserves the exact legacy IoTeX USDC identity', () => {
  const accepts = [
    { network: 'iotex', scheme: 'exact', asset: '0xother', id: 'other' },
    { network: 'iotex', scheme: 'exact', asset: IOTEX_USDC, id: 'usdc' },
  ];
  assert.equal(
    selectPaymentRequirement(accepts, 'iotex', 'exact').id,
    'usdc',
  );
});

test('selection handles current CAIP-2 requirements without legacy-package throws', () => {
  const accepts = [
    {
      network: 'eip155:8453',
      scheme: 'exact',
      asset: BASE_USDC,
      id: 'base',
    },
    {
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      scheme: 'exact',
      asset: SOLANA_USDC,
      id: 'solana',
    },
  ];

  assert.equal(
    selectPaymentRequirement(
      accepts,
      ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'eip155:8453'],
      'exact',
    ).id,
    'base',
  );
});

test('selection preserves broad fallback for unknown assets and networks', () => {
  const first = { network: 'eip155:4663', scheme: 'exact', asset: '0x1' };
  const second = { network: 'eip155:4663', scheme: 'exact', asset: '0x2' };

  assert.equal(
    selectPaymentRequirement([first, second], ['eip155:4663'], 'exact'),
    first,
  );
  assert.equal(
    selectPaymentRequirement([first], ['solana'], 'exact'),
    first,
  );
  assert.equal(selectPaymentRequirement([], ['solana'], 'exact'), undefined);
});
