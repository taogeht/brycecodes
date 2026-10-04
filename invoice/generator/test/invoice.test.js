'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model');
const { build } = require('../pdf');
const { jsPDF } = require('../vendor/jspdf.umd.min');
const sample = {recipient:{name:'Growth Consulting Ltd.',contact:'Joel Courchaine'},date:'2026-07-08',number:'',currency:'CAD',sender:'Bryce Vancuren',payment:'E-Transfer: brycev@gmail.com',phone:'0920515373',notes:'',items:[{description:'Services / Web Dev - June 2026',hours:15,rate:40}]};

test('sample invoice and fractional hours calculate in cents', () => {
    assert.equal(M.validate(sample).total, 60000);
    assert.throws(() => M.validate({...sample,date:'2026-02-30'}));
    assert.equal(M.totals([{hours:1.25,rate:40},{hours:0.1,rate:0.2}]).total, 5002);
    assert.equal(M.totals([{hours:2,rate:0}]).total, 0);
    assert.throws(() => M.totals([{hours:-1,rate:40}]));
    assert.throws(() => M.totals([{hours:1,rate:NaN}]));
    assert.throws(() => M.validate({...sample,recipient:{name:''}}));
    assert.throws(() => M.validate({...sample,items:[{description:'',hours:1,rate:40}]}));
});

test('PDF preserves recipient and payment line breaks and creates one-page sample', () => {
    const doc = build(sample,jsPDF,M), output = doc.output();
    assert.equal(doc.getNumberOfPages(), 1);
    for (const text of ['Growth Consulting Ltd.','Joel Courchaine','Bryce Vancuren','E-Transfer: brycev@gmail.com','0920515373','$600.00']) assert.ok(output.includes(text), text);
    assert.ok(!output.includes('Ltd.,Joel'), 'recipient lines stay separate');
    assert.ok(!output.includes('Vancuren,E-Transfer'), 'payment lines stay separate');
});

test('PDF paginates long invoices and long notes without dropping services', () => {
    const data = {...sample,items:Array.from({length:40},(_,i)=>({description:'Service '+i+'\nDevelopment and consulting',hours:1.25,rate:40})),notes:'Terms\n'.repeat(80)};
    const doc = build(data,jsPDF,M), output = doc.output();
    assert.ok(doc.getNumberOfPages() > 1);
    for (let i = 0; i < 40; i++) assert.ok(output.includes('(Service '+i+')'), 'Service '+i);
    assert.ok(output.includes('$2,000.00'));
    assert.equal(output.split('(Terms)').length - 1,80);
});
