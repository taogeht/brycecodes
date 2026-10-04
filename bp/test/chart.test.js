'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('graph positions both sessions inside the plot and labels each point', () => {
    const elements = new Map();
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, { addEventListener() {}, innerHTML: '' });
            return elements.get(id);
        },
        querySelectorAll() { return []; },
    };
    let script = fs.readFileSync(require.resolve('../public/index.html'), 'utf8').split('<script>')[1].split('</script>')[0];
    script = script.replace('  start();\n})();', '  globalThis.draw = readings => { state.readings = readings; renderChart(); };\n})();');
    const context = { document, Date };
    vm.runInNewContext(script, context);
    context.draw([
        { date: '2026-10-05', session: 'morning', sys: 125, dia: 75 },
        { date: '2026-10-05', session: 'evening', sys: 120, dia: 70 },
    ]);
    const svg = elements.get('chart').innerHTML;
    assert.match(svg, /Morning: 125\/75/);
    assert.match(svg, /Evening: 120\/70/);
    const points = [...svg.matchAll(/<circle cx="([^"]+)"/g)].map(m => Number(m[1]));
    assert.equal(points.length, 4);
    assert.ok(points.every(x => x >= 44 && x <= 684));
    assert.ok(points[0] < points[1], 'morning precedes evening');
    context.draw([]);
    assert.match(elements.get('chart').innerHTML, /readings are added/);
});
