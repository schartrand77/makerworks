import fs from 'node:fs';
import { globSync } from 'glob';

const approvedHexes = [
  '#ff7a1a', // brand orange
  '#42ffa1', // brand green
  '#2b2d31', // brand text
  '#e5e7eb',
  '#b6bbc6',
  '#0b0f1a',
  '#00b35f',
  '#ffffff',
  '#000000',
  '#000',
  '#fff',
  '#999999',
  '#fff0f0',
  '#9a9a9a',
  '#2f2f2f',
  '#ffd7d7'
];

const files = globSync('src/**/*.{ts,tsx,jsx,js}', { nodir: true });
const hexRegex = /#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;

let hasError = false;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = hexRegex.exec(content)) !== null) {
    const hex = match[0].toLowerCase();
    if (!approvedHexes.some((c) => c.toLowerCase() === hex)) {
      console.error(`Unapproved hex color ${hex} found in ${file}`);
      hasError = true;
    }
  }
}

if (hasError) {
  process.exit(1);
}
