import * as React from 'react';
import useSWR from 'swr';

export function usePromise<T>() {
  const [promise, setPromise] = React.useState<Promise<T>>();
  const swr = useSWR(promise, (p) => p);

  return { swr, promise, setPromise };
}
