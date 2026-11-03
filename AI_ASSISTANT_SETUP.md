# StrataForge voice and chat assistant setup

The assistant is a separate Node API behind the Vite app's `/api` path. It uses the signed-in founder's Supabase session and workspace RLS for CRM reads and writes. It does not use a service-role key. The Groq key and action signing key belong only in the API environment.

## Database

1. In the existing StrataForge Supabase project, enable the `pg_cron` extension (Database → Extensions). The migration schedules daily removal of chat messages and pending actions older than 90 days.
2. Apply `supabase/migrations/202611030001_ai_assistant.sql` through the same trusted migration process used for the earlier CRM migrations. This adds founder-private conversation, message, and action tables, RLS policies, atomic proposal-send/accept/conversion RPCs, and the retention job.
3. Confirm the three `ai_*` tables and the `strataforge-purge-ai-history` cron job exist. Test an AAL2 founder and an AAL1 or inactive user before entering real client data.

Deployment note (2026-11-03): this migration was applied to the StrataForge production Supabase project. The three assistant tables, their RLS settings, and one active `strataforge-purge-ai-history` job were verified in the SQL Editor. Apply it separately to any other environment.

The production database returned `42703` for `leads.notes`, so `202611020001_lead_notes.sql` has not been applied there. Check and apply the earlier lead migrations `202610310005_lead_timeline.sql` and `202611020002_lead_project_type.sql` if their columns are also absent. The assistant can read leads without these optional fields, but saving lead notes, project type, or timeline requires the corresponding migration.

## Local development

Add these server-only values to the existing `.env.local` (do not commit it):

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
GROQ_API_KEY=YOUR_GROQ_API_KEY
AI_ACTION_SIGNING_KEY=YOUR_OWN_RANDOM_VALUE_AT_LEAST_32_CHARACTERS
```

Keep the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser. Never add the Groq key or signing key to a `VITE_` variable. Generate a random signing key and keep it stable across API restarts; changing it invalidates pending action cards.

Run `npm run dev:api` and `npm run dev` in separate terminals. Vite proxies `/api` to `127.0.0.1:3001`. The founder account must have an active admin membership and AAL2 session. Open the **Assistant** button in the top bar. Without the server configuration or database migration, the assistant shows a setup or load error while the CRM remains usable.

Local setup note (2026-11-03): the server-only values are in the gitignored `.env.local`, the Groq key authenticated, and `qwen/qwen3.8-27b` returned a structured response to a synthetic request. The Node API is running locally, and both its direct health route and Vite's `/api` proxy returned `ready: true`. An AAL2 founder received chat replies in English and Filipino. A synthetic lead request produced a review card with the correct details; the test proposal was rejected without creating a CRM record. Start `npm run dev:api` again after the process or computer restarts. In the integrated browser, Mic started recording and Groq returned an editable transcript after Stop. Spoken words appearing during an active recording and confirmed CRM actions still need end-to-end verification.

Tap **Mic** and allow microphone access. The assistant sends short voice clips to Groq Whisper while recording and adds each returned transcript to a preview in the chat and message box, normally about every five seconds plus processing time. Tap **Stop**, correct any words in the message box, then tap **Send**. The CRM does not store recordings. Groq Whisper does not provide word-by-word streaming through this file transcription endpoint, and brief pauses may occur at clip boundaries. A microphone or provider error preserves any text already transcribed. A 60-second recording limit applies. A routine pending action is voice-confirmed only when the full transcript exactly matches its confirmation phrase; sensitive actions still require a tap.

Run `npm run test:api` and `npm run check` before deploying. `npm run build:api` emits the Node API into `server/dist`.

## Production

Run the API with server-side environment variables and `npm run start:api`. Route the public app's `/api/*` path to it through a same-origin reverse proxy. Set `AI_APP_ORIGIN` to the exact HTTPS app origin. The API listens on `127.0.0.1:3001` by default; set `AI_HOST=0.0.0.0` only when the API is inside a private container network behind the proxy. Configure TLS at the proxy.

Groq's free tier has account-dependent limits. The default text model is `qwen/qwen3.8-27b`; override it with the server-only `GROQ_MODEL` variable if necessary. The API bounds CRM context and recent history to reduce token usage, and shows the retry interval when Groq returns a rate limit. A failed provider request does not save an unanswered user message. Voice input uses `whisper-large-v3-turbo`. The app stores transcripts in private chat history for 90 days but does not store recordings. Relevant CRM context is sent to Groq only for an assistant request. Review [Groq's data controls](https://console.groq.com/docs/your-data) before using real client data.

Client email is draft-and-copy only. Spoken replies use the browser's installed voices, so Filipino playback varies by device. File uploads, MFA recovery, and account invitations remain in their existing workflows.
