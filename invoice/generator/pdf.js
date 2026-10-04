(function (root) {
  'use strict';
  function build(invoice, jsPDF, M) {
    const result = M.validate(invoice);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 14, right = 196, bottom = 275;
    const text = (value, x, y, size = 11, font = 'helvetica', options = {}) => {
      doc.setFont(font, 'normal'); doc.setFontSize(size); doc.setTextColor(35, 35, 35);
      doc.text(Array.isArray(value) ? value : String(value), x, y, { lineHeightFactor: 1.28, ...options });
    };
    const wrap = (value, width, size = 11) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
      return doc.splitTextToSize(String(value), width);
    };
    function header(continuation = false) {
      doc.setDrawColor(35); doc.setLineWidth(.25);
      doc.roundedRect(left, 15, 100, 30, 10, 10);
      text('INVOICE', 64, 35, 30, 'helvetica', { align: 'center' });
      // Quiet radial mark from the reference invoice.
      doc.setDrawColor(220, 216, 207); doc.setLineWidth(1.5);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        doc.line(186 + Math.cos(a) * 3, 27 + Math.sin(a) * 3, 186 + Math.cos(a) * 7, 27 + Math.sin(a) * 7);
      }
      doc.setDrawColor(35); doc.setLineWidth(.25);
      const recipient = wrap([invoice.recipient.name, invoice.recipient.contact, invoice.recipient.email, invoice.recipient.address].filter(Boolean).join('\n'), 90);
      const height = Math.max(34, 14 + recipient.length * 5);
      doc.roundedRect(left, 51, 100, height, 10, 10);
      text('Issued to:', left + 4, 59);
      text(recipient, left + 4, 66);
      doc.roundedRect(120, 51, 76, 30, 10, 10);
      text('Date: ' + M.dateLabel(invoice.date), 126, 61, 10);
      if (invoice.number) text(wrap('Invoice: ' + invoice.number, 64, 9), 126, 68, 9);
      if (continuation) text('Continued', left, 49, 8);
      const y = 51 + height + 16;
      text('DESCRIPTION', left + 4, y, 11, 'times');
      text('HOURS', 116, y, 11, 'times', { align: 'right' });
      text('RATE', 148, y, 11, 'times', { align: 'right' });
      text('SUBTOTAL', right, y, 11, 'times', { align: 'right' });
      return y + 12;
    }
    let y = header();
    for (const row of result.lines) {
      const lines = wrap(row.description, 86);
      let offset = 0;
      while (offset < lines.length) {
        if (y + 7 > bottom) { doc.addPage(); y = header(true); }
        const count = Math.max(1, Math.floor((bottom - y - 7) / 5));
        const part = lines.slice(offset, offset + count);
        text(part, left + 4, y);
        if (offset === 0) {
          text(row.hours, 116, y, 11, 'helvetica', { align: 'right' });
          text(M.money(Math.round(row.rate * 100), invoice.currency), 148, y, 9, 'helvetica', { align: 'right' });
          text(M.money(row.amount, invoice.currency), right, y, 11, 'helvetica', { align: 'right' });
        }
        offset += part.length; y += part.length * 5 + 7;
      }
    }
    const payment = wrap([invoice.sender, invoice.payment, invoice.phone].filter(Boolean).join('\n'), 170);
    const notes = invoice.notes ? wrap(invoice.notes, 170, 10) : [];
    const footerHeight = 46 + payment.length * 5 + notes.length * 5;
    if (y + footerHeight > bottom) { doc.addPage(); y = 32; text('INVOICE / PAYMENT DETAILS', left, 20, 15, 'times'); }
    y = Math.max(y + 12, bottom - Math.min(footerHeight, 200));
    text('TOTAL', 130, y, 16, 'times', { align: 'right' });
    text(M.money(result.total, invoice.currency), right, y, 17, 'helvetica', { align: 'right' });
    text(invoice.currency + ' · ' + result.hours + ' hours', right, y + 7, 9, 'helvetica', { align: 'right' });
    y += 22;
    text('PAYMENT DETAILS', left, y, 13, 'times');
    y += 9;
    function flowingText(lines, size) {
      for (const line of lines) {
        if (y > 268) { doc.addPage(); y = 24; text('INVOICE / PAYMENT DETAILS', left, 15, 12, 'times'); }
        text(line, left, y, size); y += 5;
      }
    }
    flowingText(payment, 11);
    y += 4;
    flowingText(notes, 10);
    text('THANK YOU', right, 282, 12, 'times', { align: 'right' });
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      doc.setPage(page); text(`${page} / ${doc.getNumberOfPages()}`, left, 289, 8);
    }
    return doc;
  }
  if (typeof module !== 'undefined') module.exports = { build };
  else root.InvoicePDF = { build };
})(globalThis);
