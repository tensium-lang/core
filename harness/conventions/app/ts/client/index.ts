// The one file to import to use the client: connect() to point it at a server, and every screen
// the app can show.

export { connect } from './rpc.ts';
export { invoiceView, productLabel, receiptLine, reminderPreview } from './views/invoice.ts';
export { contactLine, customerView } from './views/customer.ts';
export { dashboardView, overdueView } from './views/dashboard.ts';
export { agingView, catalogView, regionView, searchView } from './views/catalog.ts';
