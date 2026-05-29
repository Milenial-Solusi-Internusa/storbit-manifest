# Nexus by MSI — Document Numbering

**Last Updated:** 2026-05-23

---

## Overview

All business documents in Nexus by MSI must follow a standardized numbering format. Document numbers are:
- Unique per company and document type
- Auto-generated — never manually entered
- Non-reusable — once assigned, a number is never reused even if the document is deleted
- Traceable — the number encodes entity, department, year, and sequence

---

## 1. Standard Format

```
{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}
```

| Segment | Description | Example |
|---------|-------------|---------|
| `{DOC}` | Document type code | `QT`, `SP`, `SHP`, `INV` |
| `{ENTITY}` | Company / entity code | `MSI`, `JCI`, `STB` |
| `{DEPT}` | Department code | `SLS`, `LOG`, `FIN`, `PROC`, `IT` |
| `{YYYY}` | 4-digit year | `2026` |
| `{SEQ}` | Zero-padded sequence number | `0001`, `0042`, `1234` |

---

## 2. Document Code Registry

| Document Code | Document Name | Module |
|--------------|---------------|--------|
| `QT` | Quotation | Sales |
| `SP` | Surat Pesanan / Sales Order | Sales |
| `SHP` | Shipment / Job Card (Freight) | Operations |
| `CUS` | Customs Job Card (PPJK) | Operations |
| `TRD` | Trading Order | Operations |
| `PR` | Purchase Request | Procurement |
| `PO` | Purchase Order | Procurement |
| `GRN` | Goods Receipt Note | Procurement |
| `INV` | Invoice | Finance |
| `RCP` | Payment Receipt | Finance |
| `PV` | Payment Voucher | Finance |
| `JE` | Journal Entry | Accounting |
| `AST` | Asset | Asset Management |
| `TCK` | IT Ticket | IT Service Management |
| `HRG` | HRGA Request | HRGA |

---

## 3. Department Code Registry

| Department Code | Department Name |
|----------------|----------------|
| `SLS` | Sales |
| `LOG` | Logistics / Operations |
| `PPJK` | Customs Clearance |
| `TRD` | Trading |
| `FIN` | Finance |
| `PROC` | Procurement |
| `WHSE` | Warehouse |
| `ACCT` | Accounting |
| `HR` | Human Resources |
| `IT` | Information Technology |
| `MGMT` | Management |

---

## 4. Examples

| Document | Entity | Dept | Year | Seq | Full Number |
|---------|--------|------|------|-----|-------------|
| Quotation | MSI | Sales | 2026 | 1 | `QT/MSI/SLS/2026/0001` |
| Sales Order | MSI | Sales | 2026 | 1 | `SP/MSI/SLS/2026/0001` |
| Shipment | MSI | Logistics | 2026 | 1 | `SHP/MSI/LOG/2026/0001` |
| Customs Job | JCI | PPJK | 2026 | 1 | `CUS/JCI/PPJK/2026/0001` |
| Purchase Request | MSI | IT | 2026 | 1 | `PR/MSI/IT/2026/0001` |
| Purchase Order | Storbit | Procurement | 2026 | 1 | `PO/STB/PROC/2026/0001` |
| Invoice | JCI | Finance | 2026 | 1 | `INV/JCI/FIN/2026/0001` |
| Payment Voucher | MSI | Finance | 2026 | 1 | `PV/MSI/FIN/2026/0001` |
| Journal Entry | MSI | Finance | 2026 | 1 | `JE/MSI/FIN/2026/0001` |
| Asset | MSI | IT | 2026 | 1 | `AST/MSI/IT/2026/0001` |
| IT Ticket | MSI | IT | 2026 | 1 | `TCK/MSI/IT/2026/0001` |

---

## 5. Sequence Rules

### Reset Period
Sequences reset based on the configured `reset_period`:
- `yearly` — resets to 0001 each January 1
- `monthly` — resets to 0001 on the 1st of each month
- `never` — sequence never resets, keeps incrementing

Most document types use `yearly` reset.

### Sequence Table

```sql
document_sequences (
  id              uuid PK
  company_id      uuid NOT NULL
  document_type   varchar(20) NOT NULL    -- e.g. QT, SP, INV
  department_code varchar(20) NOT NULL
  year            integer NOT NULL
  month           integer                  -- null for yearly sequences
  last_sequence   integer DEFAULT 0
  UNIQUE (company_id, document_type, department_code, year, month)
)
```

### Sequence Generation (Atomic)
```sql
-- Get next number atomically (prevents race conditions)
UPDATE document_sequences
SET last_sequence = last_sequence + 1
WHERE company_id = $1
  AND document_type = $2
  AND department_code = $3
  AND year = $4
RETURNING
  last_sequence,
  $2 || '/' || $5 || '/' || $3 || '/' || $4 || '/' || LPAD(last_sequence::text, 4, '0')
  AS document_no;
```

**Important:** Always use `UPDATE ... RETURNING` in a single atomic operation to prevent duplicate numbers under concurrent inserts.

---

## 6. Sequence Padding

Default sequence padding: 4 digits (`LPAD(seq, 4, '0')`)

| Sequence | Padded |
|----------|--------|
| 1 | `0001` |
| 42 | `0042` |
| 999 | `0999` |
| 1000 | `1000` |
| 9999 | `9999` |
| 10000 | `10000` (auto-extends) |

---

## 7. Rules

1. Document numbers are assigned only at the moment of creation — not at draft
2. Draft documents may have no number or a temporary draft placeholder
3. Numbers are assigned only when status moves from `draft` to `submitted` (or `created` for non-approval documents)
4. Once assigned, a document number cannot be changed
5. Voided or cancelled documents retain their number — the number is not reused
6. Manual entry of document numbers is forbidden
7. All document numbers must be stored in the `document_no` column (indexed)

---

## 8. Configuration

Document type configuration is stored in `document_types` table. Admin can configure:
- Document code
- Department code
- Reset period
- Sequence padding length
- Whether approval is required

This allows flexibility for future document types without code changes.
