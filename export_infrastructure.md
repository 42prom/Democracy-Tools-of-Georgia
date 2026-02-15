TASK: Build Election Audit Export Infrastructure (CSV)

OBJECTIVE:
Create a secure, optimized infrastructure to export auditable election data in CSV format from completed polls (History page). The export must allow auditors to clearly understand how the system operated and how elections/surveys/referendums were conducted.

FUNCTIONAL REQUIREMENTS:

1. EXPORT SOURCE

- Only ended/completed polls are exportable.
- Accessible from History page.
- Each completed poll must have: "Export for Audit (CSV)" button.

2. EXPORTED DATA STRUCTURE

- mast be best in this field.

TECHNICAL REQUIREMENTS:

- Must support large datasets (streamed CSV generation).
- Memory-efficient queries.
- Do not load entire dataset into memory.
- Consistent ordering (by vote timestamp ASC).
- system time encoding.
- Excel-compatible format.
- Sanitized and normalized values.

SECURITY:

- Only authorized admin roles can export.
- Log every export (user ID, timestamp, poll ID).
- Prevent export of active/draft polls.
- Include tamper-proof dataset hash.

UI/UX:

- Must match admin theme perfectly.
- Export button inside History page poll row.
- Confirmation modal before export.
- Loading indicator during processing.
- Success notification after completion.
- Optional filters:
  - Date range
  - Include/Exclude vote-level data
  - Anonymized voter data toggle

ARCHITECTURE:

- Modular Export Service class.
- Reusable Audit Data Builder.
- Separate Query Layer.
- Background processing for large polls (if needed).
- Extendable for future formats (JSON, XLSX, Signed PDF).
- Clean, maintainable, production-ready code.

GOAL:
Deliver a robust, scalable, secure, audit-ready export system ensuring transparency, accountability, and professional election reporting.
