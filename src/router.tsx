import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routes/root";

const routerBasePath = import.meta.env.BASE_URL.replace(/\/$/u, "") || "/";

export const router = createRouter({
  basepath: routerBasePath,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  routeTree,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
