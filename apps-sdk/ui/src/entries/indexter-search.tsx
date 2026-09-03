import { createRoot } from 'react-dom/client';

import { SEARCH_WIDGET_BUILD } from '../components/x402/search/search-model';
import IndexterSearch from './x402-marketplace-search';

const root = document.getElementById('indexter-search-root');

if (root) {
  root.setAttribute('data-widget-build', SEARCH_WIDGET_BUILD);
  createRoot(root).render(<IndexterSearch />);
}

export default IndexterSearch;
