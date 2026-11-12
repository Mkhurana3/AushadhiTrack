# AushadhiTrack

A prototype for Smart India Hackathon 2026, problem statement SIH26198.

AushadhiTrack follows Jan Aushadhi medicine strip by strip, from the warehouse to the kendra to the patient. It shows where stock or money goes missing and explains every flag with the numbers behind it.

**Live demo:** https://mkhurana3.github.io/AushadhiTrack/
**Classic version** (the earlier no-build version): https://mkhurana3.github.io/AushadhiTrack/classic/

The demo runs on one synthetic district: 8 kendras in Ghaziabad, 10 medicines, 20 batches and 60 days of dispatches, bills, write-offs and weekly stock counts. Every name and figure is invented.

## How it fits together

```
ml/   Python   simulate the district ──► hash-chained ledger ──► features ──► Isolation Forest
                                              │                                     │
                                         ledger.json                            model.json
                                              ▼                                     ▼
web/  React + TypeScript   re-verify every hash ──► derive stock ──► 7 rules + model leads ──► screens
```

- **One source of truth.** Every dispatch, receipt, bill, stock count, recall and case decision is a record in an append-only ledger. Stock levels and cases are always derived from the ledger and never stored separately.
- **Tamper evidence.** Each record stores a SHA-256 hash of its contents and of the record before it. The Python pipeline writes the hashes, and the web app recomputes them in TypeScript. A shared test makes sure both languages produce the same hash for the same record. The Ledger page has a demo: it slips a fake bill into an old day's records, which hides missing stock and drops a case from high to low risk. The chain check catches the edit straight away.
- **Signed receipts.** Each kendra's billing device signs every bill with its own Ed25519 key. The QR code on a receipt carries the bill details and the signature, so a patient's phone can confirm the bill without any of the kendra's data. A receipt with an edited price fails the check.

## What it finds

**Rules.** These are deterministic checks, and every one is explained with arithmetic.

| Rule | Compares | Weight |
| --- | --- | --- |
| Stock count mismatch | Physical count against what the ledger says should be on the shelf | 3 |
| Recalled batch billed | Bills for a batch after its recall | 3 |
| Short delivery | Strips dispatched by the warehouse against strips the kendra acknowledged | 2 |
| Expired batch billed | Bill date against the batch expiry date | 2 |
| Billed above MRP | Price per strip against MRP | 2 |
| Bulk buying | One mobile number buying more than 12 strips of a medicine in 30 days | 2 |
| High write-offs | Strips written off as a share of strips received (limit 15%) | 1, or 2 above 30% |

A score of 3 or more is high risk, 2 is medium and 1 is low. The limits can be changed live on the Rules page.

**Pattern model.** This is an unsupervised model that finds patterns nobody wrote a rule for.

- **How it works.** It is an Isolation Forest (scikit-learn, 500 trees). It scores each medicine at each kendra on 8 behavioural measures, including:
  - the share of bills made in the last 30 minutes before closing
  - bills to mobile numbers never seen again
  - the share of strips bought by the top customer
  - sales growth.

  Each measure is a robust z-score against the same medicine at the other kendras, so a fast-selling medicine is not mistaken for a suspicious one.
- **What it found.** In the demo the model finds phantom billing at Raj Nagar Extension. For three weeks, bursts of 2-strip bills went to new numbers just before closing. The stock really left the kendra, so the count matches and no rule fires. The model also agrees with three of the rule cases.

**Operations**
- **Expiring stock.** Batches that will expire before they sell, with a suggested transfer to a kendra that sells faster.
- **Recalls.** Recording a recall blocks the batch at every counter. The officer can see which kendras haven't acknowledged it and which are still billing it.
- **Case workflow.** Cases move between open, in inquiry and closed. Closing a case needs a note.
- **Patient side.** In English and Hindi, a patient can check a bill or a strip's batch number and report a problem, which reaches the district office as a case.

## Run it locally

```bash
# Data and model (Python 3.11+)
cd ml
pip install -r requirements.txt
python -m pytest
python -m aushadhi_ml --out ../web/src/data     # rebuilds ledger.json and model.json

# Web app (Node 20+)
cd ../web
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest
npm run build        # static site in web/dist
npm run build:single # one self-contained HTML file in web/dist-single
```

Actions in the demo are kept in your browser's local storage. To start again, use "reset the demo" on the Ledger page.

## Deployment

On every push to `main`, `.github/workflows/deploy.yml` does the following:
- runs the Python tests
- rebuilds the data and fails if the committed ledger differs
- type-checks, tests and builds the web app
- adds `classic/` and deploys everything to GitHub Pages.

In the repository's settings, Pages must be set to deploy from **GitHub Actions**.

## Layout

| Path | What it holds |
| --- | --- |
| `ml/aushadhi_ml/` | `simulate.py` (the synthetic district and its planted scenarios), `ledger.py` (hash chain), `features.py`, `model.py` |
| `web/src/lib/` | Typed ledger, derivation, rules, Ed25519 receipt signing, app store |
| `web/src/pages/` | Officer, kendra and patient screens |
| `web/tests/`, `ml/tests/` | Vitest and pytest suites |
| `classic/` | The earlier version: plain HTML, CSS and JavaScript, no build step |

## What a real rollout would need

- A server-side ledger, with the latest hash published daily somewhere the kendras cannot edit.
- Private keys held on each kendra's billing device or a hardware module. The prototype derives demo keys from a published seed so that it can sign in the browser.
- Integration with the existing Jan Aushadhi billing software and warehouse dispatch records.
- Sign-in with real roles, an audit of officer actions, and OTP-verified patient reports.
- Model retraining every night on real data, with officers' case outcomes fed back as labels.
