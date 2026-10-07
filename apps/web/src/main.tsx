import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';

import { ColorSchemeScript } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setPlatform } from '@lift/data/platform';
import { RouterProvider } from 'react-router';
import { webPlatform } from './app/platform';
import { Providers } from './app/providers';
import { registerServiceWorker } from './app/pwa';
import { router } from './app/router';

// Before the first render, so the session screen's hooks find it.
setPlatform(webPlatform);

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="dark" />
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);

registerServiceWorker();
