import '../styles/sdk.css';
import '../styles/widgets/dexter-portfolio.css';

import { createRoot } from 'react-dom/client';
import { PortfolioLedger } from '../components/portfolio';

const root = document.getElementById('dexter-portfolio-root');

if (root) {
  root.dataset.widgetBuild = '2026-09-03.portfolio-ledger';
  createRoot(root).render(<PortfolioLedger />);
}

export default PortfolioLedger;
