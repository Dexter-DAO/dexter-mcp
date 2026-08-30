import '../styles/sdk.css';
import '../styles/widgets/stock-trade.css';

import { createRoot } from 'react-dom/client';
import { StockTradeCard } from '../components/stock-trade/StockTradeCard';

const root = document.getElementById('stock-trade-root');

if (root) {
  root.dataset.widgetBuild = '2026-08-22.xstocks-provider-identity';
  createRoot(root).render(<StockTradeCard />);
}

export default StockTradeCard;
