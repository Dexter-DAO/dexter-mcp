import { describe, expect, it } from 'vitest';
import { normalizeWalletPayload, walletCashUsdFromAtomic } from './walletPayload';

const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const ADDRESS = '11111111111111111111111111111111';
const credit = { readStatus: 'available', capAtomic: '50000000', borrowedAtomic: '20000000', availableAtomic: '30000000' };

describe('wallet cash observations', () => {
  it.each([
    {}, { balances: null }, { balances: {} }, { balances: { usdc: null } },
    { balances: { usdc: '' } }, { balances: { usdc: -1 } },
    { balances: { usdc: Number.NaN } }, { balances: { usdc: Number.POSITIVE_INFINITY } },
    { totalUsdc: null }, { chainBalances: {} }, { chainBalances: [] },
    { chainBalances: { [SOLANA]: {} } },
    { chainBalances: { [SOLANA]: { available: null, usdc: 10 } } },
    { chainBalances: { [SOLANA]: { available: 'bad' } } },
    { chainBalances: { [SOLANA]: { usdc: '' } } },
  ])('does not present an unavailable cash observation as zero: %j', (input) => {
    const parsed = normalizeWalletPayload({ address: ADDRESS, ...input });
    expect(parsed.balances.usdc).toBeNull();
    expect(parsed.balances.availableAtomic).toBeNull();
    expect(parsed.address).toBe(ADDRESS);
  });

  it.each([
    { balances: { usdc: 0, availableAtomic: '0' } },
    { balances: { availableAtomic: '0' } },
    { totalUsdc: 0 },
    { chainBalances: { [SOLANA]: { available: '0' } } },
    { chains: { [SOLANA]: { usdc: 0 } } },
    { chains: { [SOLANA]: { usdc: '0' } } },
    { spendingPower: { cashAtomic: '0', totalUsd: 0 } },
  ])('preserves measured zero in canonical and legacy payloads: %j', (input) => {
    const parsed = normalizeWalletPayload(input);
    expect(parsed.balances.usdc).toBe(0);
    expect(parsed.balances.availableAtomic).toBe('0');
  });

  it('keeps explicit unknown cash despite other numeric cash candidates', () => {
    const parsed = normalizeWalletPayload({
      address: ADDRESS, balances: { usdc: null, availableAtomic: '7000000' }, totalUsdc: 8,
      chainBalances: { [SOLANA]: { available: '9000000' } },
      spendingPower: { cashAtomic: '10000000', totalUsd: 40 }, credit,
      paymentReadiness: { status: 'funding_required' },
    });
    expect(parsed.balances.usdc).toBeNull();
    expect(parsed.balances.availableAtomic).toBeNull();
    expect(parsed.money?.cashUsd).toBeNull();
    expect(parsed.money?.accountCapacityUsd).toBeNull();
    expect(parsed.money?.paymentReadinessStatus).toBe('unknown');
    expect(parsed.money?.creditAvailableUsd).toBe(30);
    expect(parsed.money?.creditCapUsd).toBe(50);
    expect(parsed.money?.creditDrawnUsd).toBe(20);
    expect(parsed.money?.hasCreditLine).toBe(true);
  });

  it('does not replace an explicit unknown legacy total with spending power cash', () => {
    const parsed = normalizeWalletPayload({ totalUsdc: null,
      spendingPower: { cashAtomic: '10000000', totalUsd: 10 } });
    expect(parsed.balances.usdc).toBeNull();
    expect(parsed.money?.accountCapacityUsd).toBeNull();
  });

  it('keeps valid cash and omits unobserved chain entries', () => {
    const parsed = normalizeWalletPayload({ balances: { usdc: 42.25, availableAtomic: '42250000' },
      chainBalances: { [SOLANA]: { available: '42250000' }, 'eip155:8453': { available: null } } });
    expect(parsed.balances.usdc).toBe(42.25);
    expect(parsed.balances.availableAtomic).toBe('42250000');
    expect(Object.keys(parsed.chainBalances)).toEqual([SOLANA]);
  });

  it('requires a nonempty fully observed legacy chain set before deriving a total', () => {
    const partial = normalizeWalletPayload({ chainBalances: {
      [SOLANA]: { available: '0' }, 'eip155:8453': { available: null },
    } });
    expect(partial.chainBalances[SOLANA].available).toBe('0');
    expect(partial.balances.usdc).toBeNull();
    const complete = normalizeWalletPayload({ chains: {
      [SOLANA]: { usdc: '2' }, 'eip155:8453': { available: '3000000' },
    } });
    expect(complete.balances.usdc).toBe(5);
  });

  it('keeps cash separate from reported credit capacity', () => {
    const parsed = normalizeWalletPayload({ balances: { usdc: 0 }, spendingPower: null, credit });
    expect(parsed.money?.cashUsd).toBe(0);
    expect(parsed.money?.accountCapacityUsd).toBe(30);
    expect(parsed.money?.paymentReadinessStatus).toBe('credit_capacity_reported');
  });
});

describe('wallet refresh cash', () => {
  const solanaMaxAtomic = 18_446_744_073_709_551_615n;
  it.each([undefined, null, '', ' ', '-1', '1.5', '0x10', '1e6', 'bad', Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects an unavailable or malformed atomic observation: %j', (value) => {
      expect(walletCashUsdFromAtomic(value, solanaMaxAtomic)).toBeNull();
    },
  );

  it('distinguishes a measured zero from missing data and accepts a later measured balance', () => {
    expect(walletCashUsdFromAtomic(null, solanaMaxAtomic)).toBeNull();
    expect(walletCashUsdFromAtomic('0', solanaMaxAtomic)).toBe(0);
    expect(walletCashUsdFromAtomic(0, solanaMaxAtomic)).toBe(0);
    expect(walletCashUsdFromAtomic('42250000', solanaMaxAtomic)).toBe(42.25);
  });

  it('accepts the Solana u64 boundary and rejects overflow before number conversion', () => {
    expect(walletCashUsdFromAtomic('18446744073709551615', solanaMaxAtomic))
      .toBe(Number(solanaMaxAtomic) / 1e6);
    expect(walletCashUsdFromAtomic('18446744073709551616', solanaMaxAtomic)).toBeNull();
  });

  it('keeps the Solana refresh limit out of generic legacy EVM cash parsing', () => {
    const evmAtomic = '18446744073709551616';
    expect(walletCashUsdFromAtomic(evmAtomic)).toBe(Number(evmAtomic) / 1e6);
    const parsed = normalizeWalletPayload({ chainBalances: {
      'eip155:8453': { available: evmAtomic },
    } });
    expect(parsed.chainBalances['eip155:8453'].available).toBe(evmAtomic);
    expect(parsed.balances.usdc).toBe(Number(evmAtomic) / 1e6);
  });
});
