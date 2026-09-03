import '../styles/sdk.css';
import '../styles/widgets/stock-trade.css';

import { createRoot } from 'react-dom/client';
import { GovernedHistoryView } from '../components/governed-action';

const root = document.getElementById('governed-history-root');

if (root) {
  root.dataset.widgetBuild = '2026-09-03.governed-history';
  createRoot(root).render(<GovernedHistoryView />);
}

export default GovernedHistoryView;
