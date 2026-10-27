# Passwords for sign-in, and no outgoing email in v1

Members sign in with their email address and a password. We record each Member's email address but do not send email to it or verify it in v1. Housebook is self-hosted (ADR-0002), and a homelab usually has no reliable way to send email: most networks block port 25, and SPF/DKIM/DMARC are needed to stay out of spam. A sign-in or reset email lost to spam would lock a Member out.

## Considered Options

- **Passkeys only**: rejected. Browsers allow passkeys only on HTTPS with a real domain, and many homelabs reach their apps at a plain `http://` LAN address.
- **Emailed sign-in links**: rejected, because there is no outgoing email.

## Consequences

- There is no "forgot password" email. Members recover access without email; do not add an email flow without revisiting this decision.
- Housebook works over plain HTTP on a LAN. HTTPS is recommended, not required.
- The stored email address is unverified. Do not use it for recovery until a later decision adds verification.
- Future email (such as reminders) goes through one small sending interface, so an email provider can be added without changing the callers.
