import * as React from 'react';
import { PageClient } from './page-client';

export default function Home() {
  return (
    <React.Suspense>
      <PageClient />
    </React.Suspense>
  );
}
