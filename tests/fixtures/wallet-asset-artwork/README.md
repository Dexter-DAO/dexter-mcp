# Wallet asset artwork fixtures

These files make the dual-host wallet harness deterministic without drawing fake token
glyphs or contacting live product services. Production code never reads this folder:
it renders the image URLs supplied by PortfolioSnapshotV1 through Dexter's existing
image proxy.

| Fixture | Runtime identity source | Deterministic artwork provenance |
| --- | --- | --- |
| solana.svg | Jupiter metadata for wrapped SOL | Existing Dexter Solana brand asset; visually equivalent to the current Jupiter token-list mark |
| usdc.svg | Jupiter metadata for the canonical Solana USDC mint | Existing Dexter copy of Circle's USD Coin mark |
| syrup-usdc.svg | Jupiter metadata for syrupUSDC | Exact Maple metadata SVG from https://raw.githubusercontent.com/maple-labs/maple-metadata/refs/heads/main/assets/syrupUSDC.svg |
| dexter.svg | Dexter approved-asset registry | Project-owned vector equivalent of the DEXTER token artwork pinned at https://ipfs.io/ipfs/bafkreihc3q4fa42wwz56lqfzbw3tz4mrztjmr54scqes35hst3hhwph7pi |
| spcx.svg | Dexter approved-asset registry | Exact SVG from https://s3-symbol-logo.tradingview.com/spacex.svg |

The fixture payload keeps the real source URLs. The Playwright route substitutes
these local files only after decoding the existing api.dexter.cash image-proxy URL.
Unknown URLs return 404 so source fallback behavior remains testable.
