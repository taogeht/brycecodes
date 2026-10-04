(function () {
  'use strict';
  const $ = id => document.getElementById(id), M = InvoiceModel;
  const RECIPIENTS = 'invoice-generator-recipients-v1', DRAFT = 'invoice-generator-draft-v1';
  let recipients = [], selectedId = '', lines = [], saveTimer;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, bad = false) => { $('status').textContent = message; $('status').classList.toggle('bad', bad); };
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { notify('Saved data could not be loaded. You can still create and download an invoice.', true); return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { notify('This browser could not save your data. You can still download the PDF.', true); return false; }
  }
  function recipient() {
    return Object.fromEntries(['name', 'contact', 'email', 'address'].map(key => [key, $('recipient-' + key).value.trim()]));
  }
  function invoice() {
    return { recipient: recipient(), date: $('date').value, number: $('number').value.trim(), currency: $('currency').value,
      sender: $('sender').value.trim(), payment: $('payment').value.trim(), phone: $('phone').value.trim(), notes: $('notes').value.trim(), items: lines.map(row => ({ ...row })) };
  }
  function populateRecipient(value) {
    for (const key of ['name', 'contact', 'email', 'address']) $('recipient-' + key).value = value[key] || '';
  }
  function renderRecipients() {
    $('saved').innerHTML = '<option value="">New recipient</option>' + recipients.map(r => `<option value="${esc(r.id)}">${esc(r.name)}${r.contact ? ' · ' + esc(r.contact) : ''}</option>`).join('');
    $('saved').value = selectedId;
    $('delete-recipient').hidden = !selectedId;
  }
  function renderLines() {
    $('items').innerHTML = lines.map((row, i) => `<div class="service" data-index="${i}">
      <div class="service-head"><span>Service ${i + 1}</span><button type="button" data-remove="${i}" aria-label="Remove service ${i + 1}" ${lines.length === 1 ? 'hidden' : ''}>Remove</button></div>
      <label>Description<textarea data-field="description" rows="2" maxlength="1000" required>${esc(row.description)}</textarea></label>
      <div class="pair"><label>Hours<input type="number" data-field="hours" min="0.01" max="100000" step="0.01" value="${esc(row.hours)}" required></label>
      <label>Hourly rate<input type="number" data-field="rate" min="0" max="1000000" step="0.01" value="${esc(row.rate)}" required></label></div>
      <div class="service-amount" data-amount="${i}"></div></div>`).join('');
  }
  function update() {
    const data = invoice();
    let result;
    try { result = M.totals(data.items); }
    catch { result = { lines: data.items.map(row => ({ ...row, amount: 0 })), total: 0 }; }
    $('total').textContent = M.money(result.total, data.currency);
    result.lines.forEach((row, i) => { const el = document.querySelector(`[data-amount="${i}"]`); if (el) el.textContent = M.money(row.amount, data.currency); });
    const r = data.recipient;
    $('preview').innerHTML = `<div class="paper-top"><div class="invoice-title">INVOICE</div><div class="mark" aria-hidden="true">✳</div></div>
      <div class="issued"><div>Issued to:\n${esc(r.name || 'Recipient name')}${r.contact ? '\n' + esc(r.contact) : ''}${r.email ? '\n' + esc(r.email) : ''}${r.address ? '\n' + esc(r.address) : ''}</div>
      <div>Date: ${data.date ? esc(M.dateLabel(data.date)) : 'Choose a date'}${data.number ? '\nInvoice: ' + esc(data.number) : ''}</div></div>
      <table aria-label="Invoice services"><thead><tr><th>DESCRIPTION</th><th>HOURS</th><th>RATE</th><th>SUBTOTAL</th></tr></thead><tbody>${result.lines.map(row => `<tr><td>${esc(row.description || 'Service description')}</td><td>${esc(row.hours)}</td><td>${esc(M.money(Math.round(Number(row.rate || 0) * 100), data.currency))}</td><td>${esc(M.money(row.amount, data.currency))}</td></tr>`).join('')}</tbody></table>
      <div class="paper-total"><span>TOTAL</span>${esc(M.money(result.total, data.currency))}<p class="help">${esc(data.currency)}</p></div>
      <div class="paper-payment"><h3>PAYMENT DETAILS</h3>${esc([data.sender, data.payment, data.phone].filter(Boolean).join('\n'))}</div>${data.notes ? `<p class="paper-notes">${esc(data.notes)}</p>` : ''}<div class="thanks">THANK YOU</div>`;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store(DRAFT, data), 350);
  }
  recipients = read(RECIPIENTS, []);
  if (!Array.isArray(recipients)) recipients = [];
  recipients = recipients.filter(r => r && typeof r.id === 'string' && typeof r.name === 'string');
  const draft = read(DRAFT, null);
  const today = new Date();
  $('date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $('sender').value = 'Bryce Vancuren'; $('payment').value = 'E-Transfer: brycev@gmail.com'; $('phone').value = '0920515373';
  lines = [{ description: '', hours: 1, rate: 40 }];
  if (draft && typeof draft === 'object' && Array.isArray(draft.items) && draft.items.length) {
    populateRecipient(draft.recipient || {});
    for (const id of ['date', 'number', 'currency', 'sender', 'payment', 'phone', 'notes']) if (typeof draft[id] === 'string') $(id).value = draft[id];
    if (!$('currency').value) $('currency').value = 'CAD';
    lines = draft.items;
  }
  selectedId = recipients.find(r => r.name === recipient().name && String(r.contact || '') === recipient().contact)?.id || '';
  renderRecipients(); renderLines(); update();
  $('new-invoice').addEventListener('click', () => {
    const date = new Date();
    $('date').value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    $('number').value = ''; $('notes').value = '';
    lines = [{ description: '', hours: 1, rate: lines[0]?.rate ?? 40 }];
    renderLines(); update(); notify('New invoice started. Recipient and payment details kept.');
    $('items').querySelector('textarea').focus();
  });
  $('saved').addEventListener('change', () => {
    selectedId = $('saved').value;
    populateRecipient(recipients.find(r => r.id === selectedId) || {});
    $('delete-recipient').hidden = !selectedId;
    update();
  });
  $('save-recipient').addEventListener('click', () => {
    const r = recipient();
    if (!r.name) { $('recipient-name').focus(); return notify('Enter a recipient name before saving.', true); }
    if (!$('recipient-email').reportValidity()) return;
    const match = recipients.find(value => value.id === selectedId) || recipients.find(value => value.name.toLowerCase() === r.name.toLowerCase() && String(value.contact || '').toLowerCase() === r.contact.toLowerCase());
    const id = match ? match.id : crypto.randomUUID();
    const next = [...recipients.filter(value => value.id !== id), { id, ...r }].sort((a, b) => a.name.localeCompare(b.name));
    if (store(RECIPIENTS, next)) { recipients = next; selectedId = id; renderRecipients(); notify('Recipient saved for future invoices.'); }
  });
  $('delete-recipient').addEventListener('click', () => {
    const next = recipients.filter(r => r.id !== selectedId);
    if (store(RECIPIENTS, next)) { recipients = next; selectedId = ''; renderRecipients(); notify('Saved recipient removed. This invoice is unchanged.'); }
  });
  $('add-line').addEventListener('click', () => { lines.push({ description: '', hours: 1, rate: 40 }); renderLines(); update(); $('items').lastElementChild.querySelector('textarea').focus(); });
  $('items').addEventListener('click', e => {
    const button = e.target.closest('[data-remove]'); if (!button) return;
    lines.splice(Number(button.dataset.remove), 1); renderLines(); update();
  });
  $('editor').addEventListener('input', e => {
    if (e.target.dataset.field) lines[Number(e.target.closest('[data-index]').dataset.index)][e.target.dataset.field] = e.target.value;
    update();
  });
  $('editor').addEventListener('change', update);
  $('editor').addEventListener('submit', e => {
    e.preventDefault();
    try {
      const data = invoice(); M.validate(data);
      if (!window.jspdf) throw new Error('The PDF library could not load. Reload this page and try again.');
      const doc = InvoicePDF.build(data, window.jspdf.jsPDF, M);
      const filename = `Invoice_${data.date}_${data.recipient.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 70)}.pdf`;
      doc.save(filename); store(DRAFT, data); notify('PDF generated. Your download is ready.');
    } catch (err) { notify(err.message || 'Could not generate the PDF. Please try again.', true); }
  });
})();
