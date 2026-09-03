import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';

import { ColorSchemeScript } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Providers } from './app/providers';
import { registerServiceWorker } from './app/pwa';
import { router } from './app/router';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);

registerServiceWorker();
