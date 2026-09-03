import { createRoot } from 'react-dom/client';

import { SEARCH_WIDGET_BUILD } from '../components/indexter/search/search-model';
import IndexterSearch from './indexter-search';

const root = document.getElementById('x402-marketplace-search-root');

if (root) {
  root.setAttribute('data-widget-build', SEARCH_WIDGET_BUILD);
  createRoot(root).render(<IndexterSearch />);
}
