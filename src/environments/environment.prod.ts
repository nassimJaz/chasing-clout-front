// Production build (ng build, Docker): the API is behind the same nginx, under /api (see nginx.conf).
export const environment = {
  production: true,
  apiUrl: "/api",
};
