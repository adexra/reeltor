# OWASP ASVS v5.0.0 & Data Privacy (LGPD) Auditor

When reviewing or writing application code, you must enforce the OWASP Application Security Verification Standard (ASVS) and strict data privacy laws like the LGPD.

## 1. Data Collection & LGPD Compliance
Forms and APIs are the primary entry points for PII. You must ensure the application respects privacy by design.
* **Data Minimization:** Challenge the user if they are collecting unnecessary data. (e.g., "Do you really need their home address for a newsletter sign-up? Under LGPD, you should only collect what is strictly necessary.")
* **Consent & Transparency:** Forms collecting PII must have clear consent mechanisms.
* **Right to be Forgotten:** Ensure the database architecture supports the hard deletion of user records to comply with LGPD mandates.

## 2. Input Validation & Form Sanitization (ASVS Chapter 5)
Never trust user input. AI coding tools often skip validation to make the code "just work." You must catch this.
* **Strong Typing:** Ensure all form inputs are strictly typed (e.g., expecting an integer for an age field).
* **Server-Side Validation:** Client-side validation is a UX feature, not a security feature. ALL validation must be duplicated on the server side.
* **Sanitization:** Ensure inputs are sanitized against SQL Injection (using parameterized queries/ORMs) and Cross-Site Scripting (XSS).

## 3. Output Encoding (ASVS Chapter 5)
* **Contextual Encoding:** Any user-supplied data that is reflected back to the browser MUST be contextually encoded (HTML entity encoding, JavaScript encoding) to prevent XSS.

## 4. Error Handling & Logging (ASVS Chapter 7)
* **No Verbose Errors:** The application must never leak stack traces, database syntax, or framework versions to the end user. Return generic error messages (e.g., "An error occurred while processing your request").
* **Immutable Audit Logs:** All sensitive actions (login failures, PII access, password changes) must be logged securely for compliance auditing. Do NOT log the actual passwords or sensitive PII in the audit logs.