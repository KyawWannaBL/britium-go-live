import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const imagesDir = path.join(root, 'public', 'images');
const outDir = path.join(root, 'src', 'generated');
const outFile = path.join(outDir, 'backgrounds.ts');

fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(imagesDir)
  .filter((name) => /^b([1-9]|1[0-7])\.(png|jpg|jpeg|webp|gif|avif)$/i.test(name))
  .sort((a, b) => {
    const na = Number(a.match(/\d+/)?.[0] || 0);
    const nb = Number(b.match(/\d+/)?.[0] || 0);
    return na - nb;
  })
  .map((name) => `/images/${name}`);

fs.writeFileSync(
  outFile,
  `export const screenBackgrounds = ${JSON.stringify(files, null, 2)} as const;\n`,
  'utf8'
);

console.log('Generated backgrounds.ts with', files.length, 'entries');
