// Browser regression check: node alphabet-help/tests/word-layout.mjs
// Requires Playwright; PLAYWRIGHT_MODULE can point to an existing installation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ reducedMotion: process.env.REDUCED_MOTION || 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'alphabet.test') return route.abort();
    return route.fulfill({ contentType: 'text/html', body: html.replace(/\/\* ---------- First run ---------- \*\/[\s\S]*?(?=<\/script>)/, '') });
  });
  await page.goto('http://alphabet.test/');
  await page.evaluate(() => {
    document.querySelector('main').hidden = false;
    document.querySelector('#home-screen').hidden = true;
    document.querySelector('#class-screen').hidden = true;
    // Isolate the shipped card renderer from scheduling and student persistence.
    window.eval("renderPanels = () => {}; pickNext = () => window.testItem;");
  });
  const words = [
    ['book', 'c', 'amp'], ['book', 'm', 'end'], ['book', 'str', 'ength'],
    ['cvc', 'j', 'ump'], ['cvce', 'sm', 'ile'],
    ['sight', 'people'], ['sight', 'everywhere'], ['phonics', 'ough'], ['letter', 'W'],
  ];
  let checked = 0;
  for (const [width, height] of [[1368, 892], [1024, 648], [981, 700], [820, 1000], [390, 700], [320, 568]]) {
    await page.setViewportSize({ width, height });
    for (const [type, onset, rime] of words) {
      const display = onset + (rime || '');
      await page.evaluate(({ type, onset, rime, display }) => {
        window.testItem = { type, key: display, display, segments: rime ? [onset, rime] : [...display], card: { totalSeen: 0 } };
        window.eval('renderLetter()');
      }, { type, onset, rime, display });
      // Resize the same card down and back up, without re-rendering it, to
      // exercise refitting on orientation/window changes as well as first paint.
      for (const size of [{ width, height }, { width: 320, height: 568 }, { width, height }]) {
        await page.setViewportSize(size);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => {
          const letter = document.querySelector('#letter-el');
          const frame = document.querySelector('.letter-frame').getBoundingClientRect();
          const practice = document.querySelector('.practice').getBoundingClientRect();
          const rects = [...letter.querySelectorAll('.glyph')].map(el => el.getBoundingClientRect());
          const range = document.createRange();
          range.selectNodeContents(letter);
          const text = range.getBoundingClientRect();
          const arrow = document.querySelector('.read-arrow')?.getBoundingClientRect();
          return {
            oneLine: rects.every(r => Math.abs(r.top - rects[0].top) < 1),
            inside: text.left >= frame.left && text.right <= frame.right && frame.left >= practice.left && frame.right <= practice.right,
            arrowBelow: !arrow || text.bottom <= arrow.top,
            height: frame.height,
          };
        });
        const label = `${display} (${type}) at ${size.width}×${size.height}: ${JSON.stringify(layout)}`;
        assert.ok(layout.oneLine, `Word wraps: ${label}`);
        assert.ok(layout.inside, `Word overflows: ${label}`);
        assert.ok(layout.arrowBelow, `Word overlaps reading arrow: ${label}`);
        assert.ok(layout.height < size.height * 0.85, `Word card exceeds viewport: ${label}`);
        checked++;
      }
    }
  }
  assert.deepEqual(errors, [], 'No browser errors');
  if (process.env.WORD_LAYOUT_SCREENSHOT) {
    await page.setViewportSize({ width: 1368, height: 892 });
    await page.evaluate(() => {
      window.testItem = { type: 'book', key: 'camp', display: 'camp', segments: ['c', 'amp'], card: { totalSeen: 0 } };
      window.eval('renderLetter()');
    });
    await page.locator('.letter-frame').screenshot({ path: process.env.WORD_LAYOUT_SCREENSHOT });
  }
  console.log(`PASS: ${checked} word layouts fit on one line with the reading arrow below.`);
} finally {
  await browser.close();
}
