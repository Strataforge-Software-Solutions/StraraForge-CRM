# Repository guidance

- This app is a client-rendered React single-page application built with Vite and React Router. Do not reintroduce Next.js server components or server actions.
- Configure the browser Supabase client only with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put a service-role key or other secret in a `VITE_` variable; all `VITE_` values ship to browsers.
- Keep authentication at AAL2 and rely on the database workspace RLS policies and RPC validation for record access and sensitive multi-record changes.
- Use `npm run check` for TypeScript and production-build verification.
