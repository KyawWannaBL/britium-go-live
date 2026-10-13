import fs from 'node:fs';
// Root migrations remain canonical. Vercel deploys only the nested app, so ship
// exact SQL test inputs here and reject drift whenever the full repo is present.
export function readMigrationFixture(filename) {
 const fixture=fs.readFileSync(new URL(`./fixtures/migrations/${filename}`,import.meta.url),'utf8');
 const canonical=new URL(`../../supabase/migrations/${filename}`,import.meta.url);
 if(fs.existsSync(canonical)&&fs.readFileSync(canonical,'utf8')!==fixture) {
  throw new Error(`Migration fixture differs from canonical SQL: ${filename}`);
 }
 return fixture;
}
