import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

interface UseQueryOptions<T> {
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useQuery<T>(
  queryFn: () => Promise<T>,
  options: UseQueryOptions<T> = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const { toast } = useToast();

  const { enabled = true } = options;

  // Store latest callbacks in refs so they never cause re-renders
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const onSuccessRef = useRef(options.onSuccess);
  onSuccessRef.current = options.onSuccess;

  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  // refetch only increments counter - does NOT change identity on every render
  const refetch = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    queryFnRef.current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          onSuccessRef.current?.(result);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err);
          onErrorRef.current?.(err);
          toast({
            title: 'Error',
            description: err.message,
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // Only re-run when enabled changes or refetch() is called
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refreshCounter]);

  return { data, isLoading, error, refetch };
}

interface UseMutationOptions<T, V> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useMutation<T, V = unknown>(
  mutationFn: (variables: V) => Promise<T>,
  options: UseMutationOptions<T, V> = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  const mutationFnRef = useRef(mutationFn);
  mutationFnRef.current = mutationFn;

  const onSuccessRef = useRef(options.onSuccess);
  onSuccessRef.current = options.onSuccess;

  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const mutate = useCallback(async (variables: V) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await mutationFnRef.current(variables);
      onSuccessRef.current?.(result);
      toast({
        title: 'Success',
        description: 'Operation completed successfully',
      });
      return result;
    } catch (err) {
      const e = err as Error;
      setError(e);
      onErrorRef.current?.(e);
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive',
      });
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return { mutate, isLoading, error };
}