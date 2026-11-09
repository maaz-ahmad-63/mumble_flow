import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(REPO_ROOT, 'docs', 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const screens = [
  {
    name: '01-dictation-dark.png',
    url: 'http://localhost:3050/?theme=dark&sample=meeting',
    budget: 3000
  },
  {
    name: '02-dictation-light.png',
    url: 'http://localhost:3050/?theme=light&sample=email',
    budget: 3000
  },
  {
    name: '03-notetaker-notes.png',
    url: 'http://localhost:3050/?tab=notes&summarize=true&theme=dark',
    budget: 3000
  },
  {
    name: '04-command-mode.png',
    url: 'http://localhost:3050/?tab=command&theme=dark',
    budget: 2000
  },
  {
    name: '05-personal-dictionary.png',
    url: 'http://localhost:3050/?tab=dictionary&theme=dark',
    budget: 2000
  },
  {
    name: '06-voice-snippets.png',
    url: 'http://localhost:3050/?tab=snippets&theme=dark',
    budget: 2000
  },
  {
    name: '07-settings-modal.png',
    url: 'http://localhost:3050/?modal=settings&theme=dark',
    budget: 2000
  },
  {
    name: '08-contrast-mode.png',
    url: 'http://localhost:3050/?theme=contrast&sample=code',
    budget: 3000
  }
];

console.log('📸 Starting screenshot capture...');

for (const screen of screens) {
  const destPath = path.join(IMAGES_DIR, screen.name);
  console.log(`Capturing ${screen.name} from ${screen.url}...`);
  
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--window-size=1280,820',
    `--virtual-time-budget=${screen.budget}`,
    `--screenshot=${destPath}`,
    screen.url
  ];

  const res = spawnSync(CHROME_PATH, args);
  if (res.status === 0 && fs.existsSync(destPath)) {
    const stats = fs.statSync(destPath);
    console.log(`✅ Saved ${screen.name} (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    console.error(`❌ Failed to capture ${screen.name}:`, res.error || res.stderr.toString());
  }
}

console.log('🎉 Finished capturing screenshots!');






