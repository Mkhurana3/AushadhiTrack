# AushadhiTrack — SIH 2026 Prototype

AushadhiTrack is a Jan Aushadhi medicine-integrity prototype for **Smart India Hackathon 2026 — SIH26198**.

It helps district coordinators identify possible medicine diversion, excess write-offs, expired-stock sales, and dormant stock by reconciling warehouse dispatches with kendra sales and inventory records.

## Features

- Admin dashboard for district coordinators
- Risk inbox with explainable anomaly flags
- Batch registry and chain-of-custody tracking
- Vendor billing interface
- Customer SMS-consent flow and bill simulation
- QR-based purchase-verification demo
- Receiver/citizen verification portal
- Aadhaar-safe future-security roadmap

## Demo data

This prototype uses clearly labelled **synthetic data**:

- 7 Jan Aushadhi Kendras
- 10 priority medicine SKUs
- 70 medicine-inventory records
- Rule scenarios for stock mismatch, abnormal write-offs, expired-stock sales, and dormant stock

## Technology used

- HTML
- CSS
- Vanilla JavaScript

## Run locally

1. Download or clone this repository.
2. Open the project folder.
3. Double-click `index.html`.

Or run a local server:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Interfaces

### Admin / District Coordinator

Reviews the network dashboard, creates batches, and investigates flagged records with supporting reconciliation figures.

### Vendor / Kendra Operator

Records a medicine sale, captures customer SMS consent, generates a bill, and displays a QR-verifiable receipt.

### Receiver / Citizen

Verifies a medicine purchase by scanning a QR receipt in the prototype flow.

## Anomaly rules

| Rule               | Trigger                                                         |
| ------------------ | --------------------------------------------------------------- |
| Stock balance      | Dispatched − (sold + written off) does not match reported stock |
| Write-off ratio    | Written-off quantity exceeds 15% of dispatched quantity         |
| Expiry consistency | A sale is recorded after the batch expiry date                  |
| Dormant stock      | Stock remains but the SKU has no sales for an unusual period    |

## Production roadmap

A production version would use:

- React frontend
- FastAPI backend
- PostgreSQL database
- Authorised PMBI warehouse and POS integrations
- MSG91 or Twilio for consent-gated SMS
- Signed QR verification tokens
- Role-based access controls and append-only audit records

Any Aadhaar-linked feature would require explicit consent, tokenisation, encryption, minimal data storage, and legal/security review. Aadhaar must not be used as a public identifier or default login.

## Disclaimer

This is a hackathon prototype using synthetic data calibrated to the supplied research model. It does not connect to live PMBI, warehouse, POS, SMS, Aadhaar, or payment systems.
