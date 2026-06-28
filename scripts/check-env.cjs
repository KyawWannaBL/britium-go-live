const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing environment variables:', missing.join(', '));
  console.error('Create .env.local from .env.production.example or assign them in Vercel.');
  process.exit(1);
}
console.log('Environment variables are present.');
