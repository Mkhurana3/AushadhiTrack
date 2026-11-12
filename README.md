# AushadhiTrack — SIH 2026 Prototype

AushadhiTrack is a Jan Aushadhi medicine-integrity prototype for **Smart India Hackathon 2026 — SIH26198**.

It helps district coordinators spot possible medicine diversion, excess write-offs, expired-stock sales and dormant stock by reconciling warehouse dispatches with kendra sales and inventory records — and every flag explains exactly which numbers triggered it.

**Live demo:** https://mkhurana3.github.io/AushadhiTrack/

## Features

- **Command centre** — live counts, a priority review queue and a risk distribution chart, all computed from the data
- **Explainable risk inbox** — every flagged record shows the rules it broke, the numbers behind them and a severity score; mark records as reviewed or export the list as CSV
- **Batch registry** — dispatch batches to a kendra; stock is added only when the kendra confirms receipt
- **Vendor counter** — billing that blocks sales of expired stock or more units than are on hand, with a masked-number receipt and verification code
- **Citizen verification** — anyone can check a bill code; unknown codes are rejected as not in the ledger
- **Append-only event ledger** — dispatches, receipts, sales, blocked sales, reviews and verifications are all recorded
- **Role-based demo login** — district coordinator, kendra vendor and citizen each see only their own tools

## How the rules work

Each inventory record is checked against four rules. Each rule that fires adds to a severity score.

| Rule | Fires when | Score |
| --- | --- | --- |
| Stock balance | Dispatched − sold − written off ≠ reported stock | +3 |
| Write-off ratio | More than 15% of dispatched stock is written off | +1 (+2 above 30%) |
| Expired-stock sale | A sale is recorded after the batch's expiry date | +2 |
| Dormant stock | Stock is on hand but nothing has sold for 10+ days | +1 |

**Risk level:** score 3 or more → **High**, 2 → **Medium**, 1 → **Low**.

The rules live in `app.js` (`RULES` and `evaluate()`), so thresholds are easy to tune.

## Demo data

The prototype uses clearly labelled **synthetic data** with a reference date of 2 September 2026:

- 7 Jan Aushadhi Kendras around Noida, Ghaziabad and Meerut
- 10 priority medicine SKUs
- 70 inventory records, 9 of which are seeded with suspicious patterns

Nothing is saved: refreshing the page resets the demo.

## Run locally

No build step or install is needed — it is plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/Mkhurana3/AushadhiTrack.git
cd AushadhiTrack
python3 -m http.server 4173
```

Then open http://localhost:4173 (or just double-click `index.html`).

## Project structure

```text
index.html    page shell: sidebar, top bar, modal and toast containers
styles.css    all styling, including the responsive layout
app.js        synthetic data, rule engine, views and event handling
favicon.svg   site icon
```

## Production roadmap

A production version would use:

- React frontend
- FastAPI backend
- PostgreSQL database
- Authorised PMBI warehouse and POS integrations
- MSG91 or Twilio for consent-gated SMS
- Signed QR verification tokens
- Role-based access controls and append-only audit records

Any Aadhaar-linked feature would require explicit consent, tokenisation, encryption, minimal data storage and a legal/security review. Aadhaar must not be used as a public identifier or default login.
