"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

/** False until WagmiProvider is mounted; default false so hooks stay gated outside. */
export const Web3MountedContext = createContext(false);

export function useWeb3Mounted() {
  return useContext(Web3MountedContext);
}

/**
 * Client-mount only: do not render WagmiProvider until after useEffect so
 * SSR/first paint and Safari without ethereum cannot blow up the whole app.
 * Consumers must gate wagmi hooks with useWeb3Mounted() / an Inner component.
 */
export function Web3Provider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Web3MountedContext.Provider value={false}>
        {children}
      </Web3MountedContext.Provider>
    );
  }

  return (
    <Web3MountedContext.Provider value={true}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </Web3MountedContext.Provider>
  );
}
