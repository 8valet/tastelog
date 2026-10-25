import { spawn } from 'node:child_process';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const baseURL = 'http://localhost:3211';
const server = spawn(process.execPath, ['scripts/library-test-server.mjs'], { stdio: 'inherit', windowsHide: true });
let browser;
let context;
let page;
let stopped = false;
const stop = async () => {
  if (stopped) return;
  stopped = true;
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server.kill();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

const waitForServer = async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Demo server exited with code ${server.exitCode}`);
    try { if ((await fetch(`${baseURL}/admin/library`)).ok) return; } catch {}
    await delay(500);
  }
  throw new Error('Demo server did not become ready within two minutes');
};

try {
  await waitForServer();
  await mkdir('docs/screenshots', { recursive: true });
  await mkdir('work/demo', { recursive: true });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`${baseURL}/admin/library`);
  await page.getByLabel('Email', { exact: true }).fill('owner@library.test');
  await page.getByLabel('Password', { exact: true }).fill('library-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Pick for me', exact: true }).waitFor();

  const samples = [
    { id: 'tmdb:movie:278', type: 'movies', title: 'The Shawshank Redemption', year: 1994, poster: 'https://image.tmdb.org/t/p/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', genres: ['Drama'], provider: 'tmdb', providerId: '278', sourceUrl: 'https://www.themoviedb.org/movie/278' },
    { id: 'tmdb:tv:209867', type: 'anime', title: "Frieren: Beyond Journey's End", year: 2023, poster: 'https://image.tmdb.org/t/p/w500/dqZENchTd7lp5zht7BdlqM7RBhD.jpg', genres: ['Adventure', 'Drama', 'Fantasy'], provider: 'tmdb', providerId: '209867', sourceUrl: 'https://www.themoviedb.org/tv/209867' },
    { id: 'manual:demo:bg3', type: 'games', title: "Baldur's Gate 3", year: 2023, poster: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co670h.jpg', genres: ['Adventure', 'RPG'], provider: 'manual', providerId: '', sourceUrl: 'https://store.steampowered.com/app/1086940/Baldurs_Gate_3/' },
  ];
  for (const work of samples) {
    const state = await page.evaluate(async () => (await fetch('/api/library')).json());
    const result = await page.evaluate(async ({ revision, work }) => {
      const response = await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, requestId: crypto.randomUUID(), command: { op: 'save', work: { ...work, episodes: null, seasons: null, summary: '' }, patch: { status: 'backlog', visibility: 'private' } } }) });
      return { status: response.status, body: await response.json() };
    }, { revision: state.revision, work });
    if (result.status !== 200) throw new Error(`Could not seed isolated demo record: ${JSON.stringify(result.body)}`);
  }

  await page.goto(`${baseURL}/library?view=collection&status=all`);
  await page.locator('.az-library[data-library-ready="true"]').waitFor();
  await page.locator('.poster-frame img').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-frame img')].filter(image => image.complete && image.naturalWidth > 0).length >= 3, null, { timeout: 30000 });
  await page.screenshot({ path: 'docs/screenshots/overview.png', fullPage: true });

  const videoPath = 'work/demo/tastelog-demo.webm';
  const frames = [];
  let lastFrameAt = 0;
  await page.screencast.start({ path: videoPath, size: { width: 1440, height: 900 }, onFrame: ({ data }) => {
    const now = Date.now();
    if (now - lastFrameAt >= 250) { frames.push(Buffer.from(data)); lastFrameAt = now; }
  } });
  await page.waitForTimeout(900);
  for (const title of [samples[0].title, samples[1].title, samples[2].title]) {
    const card = page.getByRole('button', { name: title, exact: true });
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.waitForTimeout(1100);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(500);
  }
  await page.getByRole('button', { name: 'Pick for me', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/roulette.png', fullPage: true });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Spin', exact: true }).click();
  await page.getByRole('status').getByRole('heading').waitFor({ timeout: 12000 });
  await page.waitForTimeout(1200);
  await page.screencast.stop();
  await context.close();
  context = undefined;
  await browser.close();
  browser = undefined;

  if (frames.length < 2) throw new Error('The browser recording did not capture enough frames to create a GIF.');
  const gifWidth = 960, gifHeight = 600;
  const convertedFrames = await Promise.all(frames.map(frame => sharp(frame).resize(gifWidth, gifHeight, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
  const pixels = Buffer.concat(convertedFrames.map(frame => frame.data));
  await copyFile(videoPath, 'docs/demo.webm');
  await sharp(pixels, { raw: { width: gifWidth, height: gifHeight * convertedFrames.length, channels: 3, pageHeight: gifHeight } })
    .gif({ delay: Array(convertedFrames.length).fill(250), loop: 0, colours: 160, effort: 7 })
    .toFile('docs/demo.gif');
  await rm('work/demo', { recursive: true, force: true });
  if (errors.length) throw new Error(`Browser errors during recording: ${errors.join('; ')}`);
  console.log('Created docs/demo.gif, docs/demo.webm, and refreshed screenshots with an isolated disposable library.');
} finally {
  await stop();
}
