'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

// Optional browser checks, like the optional database integration tests.
// Set LOADOUT_PLAYWRIGHT_MODULE to a Playwright package path. An installed
// Chrome can be selected with LOADOUT_CHROME_EXECUTABLE.
if (!process.env.LOADOUT_PLAYWRIGHT_MODULE) {
    test('weekly print browser checks (needs LOADOUT_PLAYWRIGHT_MODULE)', { skip: true }, () => {});
} else {
    const { chromium } = require(process.env.LOADOUT_PLAYWRIGHT_MODULE);
    const config = require('../lib/default-config')();
    const tz = require('../lib/tz');
    const week = '2026-10-19';
    const payload = { week, today: week, earliestEntryDate: '2026-10-12', hq: false,
        dates: Array.from({ length: 7 }, (_, i) => tz.addDays(week, i)), days: {},
        child: config.child, powerUps: config.powerUps,
        quests: config.quests.filter(q => !['pack-check', 'piano'].includes(q.id)) };
    const publicDir = path.resolve(__dirname, '../public');
    let server, browser, base;
    const pagesIn = pdf => (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    async function openPage(width = 1280) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        // A paper-only customization must never call a mutation endpoint.
        page.on('request', request => assert.equal(request.method(), 'GET'));
        await page.goto(base + '/loadout/weekly');
        await page.waitForFunction(() => !document.getElementById('print').disabled);
        return page;
    }
    test.before(async () => {
        const app = express();
        app.get('/api/loadout/week', (req, res) => res.json(payload));
        app.use('/loadout', express.static(publicDir));
        app.get('/loadout/weekly', (req, res) => res.sendFile(path.join(publicDir, 'weekly.html')));
        server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
        base = 'http://127.0.0.1:' + server.address().port;
        browser = await chromium.launch({ headless: true,
            ...(process.env.LOADOUT_CHROME_EXECUTABLE ? { executablePath: process.env.LOADOUT_CHROME_EXECUTABLE } : {}) });
    });
    test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });

    test('A4 checklist stays on one portrait page with a saved landscape preference, from both views', async () => {
        for (const width of [390, 1280]) {
            const page = await openPage(width);
            for (const entry of [false, true]) {
                if (entry) await page.locator('#entry-mode').click();
                const pdf = await page.pdf({ format: 'A4', landscape: true, preferCSSPageSize: true,
                    displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<span>Checklist</span>' });
                assert.equal(pagesIn(pdf), 1, 'checklist must not spill to a second page');
                const size = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
                assert.ok(size && Number(size[1]) < Number(size[2]), 'CSS must request portrait despite the saved preference');
            }
            await page.close();
        }
    });
    test('selecting paper tasks and hiding bonuses persists without changing the entry board', async () => {
        const page = await openPage();
        await page.locator('#task-picker summary').click();
        await page.locator('[data-print-none]').click();
        assert.equal(await page.locator('#print').isDisabled(), true);
        await page.getByLabel('Reading', { exact: true }).check();
        assert.equal(await page.locator('#paper tbody tr').count(), 1);
        assert.match(await page.locator('#paper tbody').innerText(), /Reading/);
        await page.locator('#print-bonuses').uncheck();
        assert.equal(await page.locator('#paper .bonus-line, #paper .bonus-key').count(), 0);
        await page.reload();
        await page.waitForFunction(() => !document.getElementById('print').disabled);
        assert.equal(await page.locator('#paper tbody tr').count(), 1);
        assert.equal(await page.locator('#paper .bonus-line').count(), 0);
        await page.locator('#entry-mode').click();
        assert.equal(await page.locator('.entry-row').count(), payload.quests.length);
        await page.close();
    });
    test('extra tasks can be added and removed and stay off the reward entry form', async () => {
        const page = await openPage();
        await page.locator('#task-picker summary').click();
        await page.locator('#extra-task-name').fill('Water the plants');
        await page.locator('#extra-task-kind').selectOption('count');
        await page.getByRole('button', { name: 'Add to sheet' }).click();
        assert.equal(await page.locator('#paper tbody tr').count(), payload.quests.length + 1);
        assert.match(await page.locator('#paper tbody').innerText(), /Water the plants/);
        await page.locator('#entry-mode').click();
        assert.equal(await page.locator('.entry-row').count(), payload.quests.length);
        await page.locator('#paper-mode').click();
        await page.getByRole('button', { name: 'Remove Water the plants' }).click();
        assert.equal(await page.locator('#paper tbody tr').count(), payload.quests.length);
        await page.close();
    });
}
