# Invoice generator

Open `/invoice/generator/` through the existing Express server. Dashboard and classroom scheduler links point here.

Recipient name/company, contact, email and address can be saved, selected, updated and removed. Recipients and the current invoice draft are stored in this browser's localStorage; they do not sync across devices. Clearing browser site data clears them. PDF generation runs entirely in the browser without sending invoice details to a service.

The June 2026 reference supplies the rounded invoice layout and default payment details. CAD and $40/hour are editable defaults; the sample PDF does not specify a currency. Each service has a description, decimal hours and hourly rate. Subtotals are rounded to cents and summed. The form supports multiple services, optional invoice number and notes. New invoice keeps recipient and payment details and clears the service list and notes.

The vendored jsPDF 2.5.1 UMD build is from https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js (MIT license, included in its header). It avoids requiring a CDN connection at runtime. PDFs use built-in Latin fonts and A4 pages; long services and notes paginate automatically. CJK text requires a future embedded Unicode font.

Run `node --test invoice/generator/test/*.test.js`, or the root `npm test`.
