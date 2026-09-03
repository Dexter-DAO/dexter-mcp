import { createRoot } from 'react-dom/client';

import WalletApp from './dexter-wallet';

const root = document.getElementById('x402-wallet-root');

if (root) createRoot(root).render(<WalletApp />);
