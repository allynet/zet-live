import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/app.css";
import { router, wireUnauthorizedRedirect } from "@/router";

wireUnauthorizedRedirect();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: "always",
    },
  },
});

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="dark" position="bottom-right" richColors />
    </QueryClientProvider>
  </StrictMode>,
);
