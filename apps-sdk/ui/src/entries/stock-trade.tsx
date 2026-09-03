import '../styles/sdk.css';
import '../styles/widgets/stock-trade.css';

import { createRoot } from 'react-dom/client';
import { GovernedActionView } from '../components/governed-action';

const root = document.getElementById('governed-action-root')
  ?? document.getElementById('stock-trade-root');

if (root) {
  root.dataset.widgetBuild = '2026-09-03.governed-action';
  createRoot(root).render(<GovernedActionView />);
}

export default GovernedActionView;
