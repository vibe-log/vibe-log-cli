# Security Policy

## Supported Versions

We release security patches for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously at Vibelog. If you discover a security vulnerability, please follow these steps:

1. **DO NOT** open a public issue
2. Email security@vibe-log.dev with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your contact information

We will acknowledge receipt within 48 hours and provide updates on our investigation.

## Security Features

### Authentication & Authorization
- **Token Encryption**: Tokens are encrypted using AES-256-GCM with randomly generated 256-bit keys
- **Key Storage**: Encryption keys are stored separately with restricted file permissions (0600)
- **Session Management**: Browser authentication uses cryptographically secure session IDs
- **CSRF Protection**: All browser-based auth flows include CSRF tokens

### Input Validation
- **Path Traversal Prevention**: All file paths are sanitized to prevent directory traversal
- **URL Validation**: Only HTTPS URLs are accepted (HTTP in development)
- **Command Injection Prevention**: All user inputs are validated against dangerous patterns
- **Date Validation**: Date inputs are sanitized and range-checked

### Network Security
- **HTTPS Enforcement**: All API communications require HTTPS
- **Certificate Validation**: SSL/TLS certificates are validated
- **Request Signing**: API requests include signed timestamps and request IDs
- **Rate Limiting**: Client-side rate limiting (60 requests/minute)

### Data Protection
- **Zero Code Transmission**: Actual code content never leaves your machine
- **Privacy-First Design**: Conversation messages are analyzed locally and converted to anonymous statistics
- **Minimal Data Collection**: Only metadata is sent:
  - Session duration and timestamps
  - Number of messages (not content)
  - File types edited (not file contents)
  - Sanitized project paths
  - Message type statistics (code/question/explanation ratios)
- **Data Sanitization**: All data is sanitized before logging or transmission
- **No Sensitive Data in Logs**: Tokens, user data, and message content are never logged
- **Secure Error Messages**: Error messages don't expose system information
- **Verification**: Use `--dry` flag to inspect exactly what data would be sent

## Security Checklist for Contributors

Before submitting a PR:

- [ ] No hardcoded secrets or tokens
- [ ] All user inputs are validated
- [ ] No use of `eval()` or dynamic code execution
- [ ] Dependencies are up to date
- [ ] No sensitive data in error messages
- [ ] File operations use sanitized paths
- [ ] Network requests use HTTPS

## Dependencies

We regularly audit our dependencies:

```bash
# Check for known vulnerabilities
npm audit

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

## Security Headers

The Vibelog API enforces these security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`

## Compliance

This CLI follows security best practices from:
- OWASP Top 10
- CWE/SANS Top 25
- Node.js Security Best Practices

## Version History

### v1.0.0 - Security Enhancements
- Implemented secure token storage with random encryption keys
- Added comprehensive input validation
- Implemented CSRF protection for browser auth
- Added rate limiting
- Enhanced error handling to prevent information disclosure