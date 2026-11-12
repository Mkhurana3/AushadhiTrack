import { fmtShort, num } from './format';
import { BATCH, DRUG, kname } from './master';
import type { EventType, Item, LedgerEvent } from './types';

const sumQty = (items: Item[]) => items.reduce((s, i) => s + i[1], 0);

export const TYPE_LABEL: Record<EventType, string> = {
  dispatch: 'Dispatch', receipt: 'Receipt', dayclose: 'Day close', sale: 'Bill', count: 'Stock count', recall: 'Recall',
  ack: 'Recall noted', case: 'Case update', complaint: 'Patient report', 'transfer-request': 'Transfer request', transfer: 'Transfer',
};

export function summarize(e: LedgerEvent): string {
  switch (e.type) {
    case 'dispatch': return `Challan ${e.data.challan} to ${kname(e.data.to)}: ${num(sumQty(e.data.items))} strips of ${e.data.items.length} medicines`;
    case 'receipt': return `${kname(e.data.kendra)} received challan ${e.data.challan}: ${num(sumQty(e.data.items))} strips`;
    case 'dayclose': {
      const units = e.data.bills.reduce((s, b) => s + b[4], 0), w = e.data.written.reduce((s, x) => s + x[1], 0);
      return `${kname(e.data.kendra)} closed ${fmtShort(e.data.date)}: ${e.data.bills.length} bills, ${units} strips${w ? `, ${w} written off` : ''}`;
    }
    case 'sale': return `${kname(e.data.kendra)} bill ${e.data.bill[0]}: ${e.data.bill[4]} × ${DRUG[BATCH[e.data.bill[3]].drug].name}`;
    case 'count': return `${kname(e.data.kendra)} counted ${e.data.items.length} batches`;
    case 'recall': return `Batch ${e.data.batch} recalled. ${e.data.reason}`;
    case 'ack': return `${kname(e.data.kendra)} noted the recall of ${e.data.batch}`;
    case 'case': return `Case ${e.data.case} set to ${e.data.status.toLowerCase()}`;
    case 'complaint': return `Patient report ${e.data.ref}: ${e.data.reasonText.toLowerCase()}`;
    case 'transfer-request': return `Transfer requested: ${e.data.qty} strips of ${e.data.batch}, ${kname(e.data.from)} to ${kname(e.data.to)}`;
    case 'transfer': return `${kname(e.data.from)} sent ${e.data.qty} strips of ${e.data.batch} to ${kname(e.data.to)}`;
  }
}
