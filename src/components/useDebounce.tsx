import * as React from 'react';

export function useDebounce<T>(args: { value: T; delay: number }): T {
  const { value, delay } = args;
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function Debounce<T>(props: {
  value: T;
  delay: number;
  children: (value: T) => React.ReactNode;
}) {
  const debouncedValue = useDebounce(props);

  return <>{props.children(debouncedValue)}</>;
}
