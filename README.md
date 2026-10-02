# dealing_dot

A mobile-first PWA for tracking Nomo games and saving the final scores to Supabase.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add your Supabase values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the app:
   ```bash
   npm run dev
   ```

## Production build

```bash
npm run build
```

This outputs the production bundle to the `dist` directory, which is suitable for deployment on Cloudflare Pages.

## Environment variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
