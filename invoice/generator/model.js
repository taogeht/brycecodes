(function (root) {
  'use strict';
  function totals(items) {
    const lines = items.map(item => {
      const hours = Number(item.hours), rate = Number(item.rate);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 100000) throw new Error('Hours must be greater than zero and no more than 100,000.');
      if (!Number.isFinite(rate) || rate < 0 || rate > 1000000) throw new Error('Hourly rate must be between 0 and 1,000,000.');
      return { ...item, hours, rate, amount: Math.round((hours * Math.round(rate * 100)) + 1e-8) };
    });
    return { lines, hours: lines.reduce((sum, row) => sum + row.hours, 0), total: lines.reduce((sum, row) => sum + row.amount, 0) };
  }
  function validate(invoice) {
    if (!invoice.recipient.name.trim()) throw new Error('Enter a recipient name or company.');
    if (!invoice.sender.trim()) throw new Error('Enter your name in payment details.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice.date) || !Number.isFinite(Date.parse(invoice.date + 'T12:00:00Z')) || new Date(invoice.date + 'T12:00:00Z').toISOString().slice(0, 10) !== invoice.date) throw new Error('Choose an issue date.');
    if (!invoice.items.length || invoice.items.some(row => !row.description.trim())) throw new Error('Add a description to each service.');
    return totals(invoice.items);
  }
  const money = (cents, currency) => new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);
  const dateLabel = date => new Date(date + 'T12:00:00Z').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const model = { totals, validate, money, dateLabel };
  if (typeof module !== 'undefined') module.exports = model;
  else root.InvoiceModel = model;
})(globalThis);
