# Nexus by MSI — Monitoring Strategy

**Last Updated:** 2026-05-23

---

## Overview

Nexus by MSI must be observable and monitorable. This document defines the monitoring strategy across frontend, backend, database, and security.

---

## 1. Monitoring Layers

| Layer | Tool | Status |
|-------|------|--------|
| Frontend Error Monitoring | Sentry | Planned |
| Backend / DB Logs | Supabase Dashboard Logs | Available now |
| Performance Monitoring | Vercel Analytics | Available (free tier) |
| Uptime Monitoring | External checker (future) | Planned |
| Audit Events | Nexus audit_logs table | Built into platform |

---

## 2. Sentry Integration (Frontend)

### Setup (Planned)
```typescript
// main.jsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_APP_ENV,
  enabled: import.meta.env.VITE_APP_ENV === 'production',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,      // mask all text (PII protection)
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: 0.1,      // 10% of transactions
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
});
```

### Sentry Rules
- Enable only in `staging` and `production`
- Disable in `development` (avoid noise)
- Source maps uploaded to Sentry, NOT included in public build
- Mask all PII in Sentry events — no customer names, emails, or financial data in error context
- Configure alert for: new issues, spike in error rate, new release regression

---

## 3. Supabase Monitoring

### Available in Supabase Dashboard
- **Query Performance**: `pg_stat_statements` — identify slow queries
- **Auth Logs**: login attempts, failures, MFA events
- **API Logs**: all PostgREST requests, response times, error rates
- **Edge Function Logs**: execution logs for Edge Functions
- **Storage Logs**: file upload / access logs
- **Database CPU / Memory**: usage metrics

### Regular Review Schedule
| Check | Frequency | Action if Anomaly |
|-------|-----------|------------------|
| Slow queries (> 500ms) | Weekly | Add index or optimize query |
| Failed auth attempts | Daily (automated alert) | Investigate if > 10 failures from same IP |
| API error rate | Daily | Investigate if > 1% 5xx errors |
| Database storage growth | Monthly | Plan capacity if > 80% |
| Row count growth on audit_logs | Monthly | Plan archiving if > 1M rows |

---

## 4. Vercel Monitoring

### Available in Vercel Dashboard
- **Function Logs**: Edge Function and API route logs
- **Analytics**: page views, Core Web Vitals (LCP, FCP, CLS)
- **Build Logs**: per-deployment build output
- **Deployment History**: rollback reference

### Core Web Vitals Targets
| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| LCP (Largest Contentful Paint) | < 2.5s | > 4s |
| FCP (First Contentful Paint) | < 1.8s | > 3s |
| CLS (Cumulative Layout Shift) | < 0.1 | > 0.25 |
| TTFB (Time to First Byte) | < 800ms | > 1.8s |

---

## 5. Application-Level Monitoring

### Error Boundary
All major page sections must be wrapped in React Error Boundary:

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Report to Sentry
    Sentry.captureException(error, { extra: info });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

### Loading States
All data fetching must have:
- Loading state (skeleton or spinner)
- Error state (user-friendly error message + retry button)
- Empty state (clear message when no data)

---

## 6. Security Monitoring

### Failed Login Monitoring
Track and alert on:
- > 5 failed login attempts from same IP within 5 minutes → log + alert
- > 10 failed attempts from same email within 10 minutes → consider temporary lockout
- Login from new country/IP for MFA users → trigger MFA challenge

### Audit Log Anomaly Detection (Future)
- Alert on mass export events
- Alert on bulk delete events
- Alert on permission changes outside business hours
- Alert on unusual data access patterns

---

## 7. Alerting

### Immediate Alerts (Critical)
| Event | Channel | Who |
|-------|---------|-----|
| Application down (5xx spike) | Email + Slack | Tech Lead |
| Auth system failure | Email + Slack | Tech Lead |
| Database connection failure | Email + Slack | Tech Lead |
| Sentry new critical issue | Email | Tech Lead |

### Daily Alerts (Important)
| Event | Channel | Who |
|-------|---------|-----|
| Slow query report | Email | Tech Lead |
| Failed login spike | Email | Tech Lead, Admin |
| Storage usage > 80% | Email | Tech Lead |

### Weekly Summary
- Query performance summary
- Error rate summary
- New Sentry issues this week
- Deployment log

---

## 8. Incident Response

### Severity Levels

| Level | Definition | Response Time | Example |
|-------|-----------|---------------|---------|
| P1 — Critical | Platform down, data loss risk | Immediate (< 15 min) | DB offline, auth broken |
| P2 — High | Major feature broken | < 2 hours | Invoice module 500, payment failing |
| P3 — Medium | Feature degraded | < 1 business day | Slow loading, minor UI bug |
| P4 — Low | Minor issue | Next sprint | Cosmetic bug, non-blocking |

### Incident Steps
1. Detect (alert fires or user reports)
2. Triage (assess severity)
3. Communicate (notify team and affected users)
4. Investigate (logs, Sentry, Supabase dashboard)
5. Fix or rollback
6. Verify fix
7. Post-mortem (for P1 and P2)

---

## 9. Logging Standards

### What to Log
- Application errors → Sentry
- Supabase query errors → already logged by Supabase
- Business audit events → `audit_logs` table
- Edge Function events → Supabase Edge Function logs

### What NOT to Log
- Passwords, tokens, secrets
- Full credit card numbers
- Customer PII in raw form
- Financial data in plain text in error messages
