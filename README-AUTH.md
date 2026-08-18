# GS-One first-party login + API auth (v0.7.0)

## Browser login

- `/login` or `/login.html`
- Username/email + password
- New accounts may register when `ALLOW_SIGNUP=true` (default for test deployments).
- Passwords are hashed with Node.js `scrypt` plus a per-user random salt.
- The browser receives an opaque `gs_session_...` token. Only its SHA-256 hash is stored in `auth_sessions`.
- Default session lifetime: 168 hours (7 days), configurable with `SESSION_TTL_HOURS`.

## REST auth API

```http
POST /api/v1/auth/register
Content-Type: application/json

{"username":"jeremy","email":"me@example.com","password":"strong-password"}
```

```http
POST /api/v1/auth/login
Content-Type: application/json

{"identifier":"jeremy","password":"strong-password"}
```

The login response contains a bearer token:

```json
{"success":true,"token":"gs_session_...","token_type":"Bearer","expires_at":"...","user":{"id":"...","username":"jeremy"}}
```

Use it for first-party SaaS endpoints:

```http
Authorization: Bearer gs_session_...
```

```http
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

## API keys for Flux / external services

A signed-in user can create their own API key without exposing the account password:

```http
POST /api/v1/api-keys
Authorization: Bearer gs_session_...
Content-Type: application/json

{"name":"Flux","mode":"test","scopes":["videos:read","videos:write","models:read","wallet:read"]}
```

The `sk_test_...` / `sk_live_...` secret is returned only when it is created. Store it in the Flux backend, never in browser JavaScript.

## GraphQL login API

```graphql
mutation {
  login(identifier: "jeremy", password: "strong-password") {
    token
    expiresAt
    user { id username email }
  }
}
```

Other auth operations: `register`, `authMe`, `logout`.
Video generation GraphQL continues to use API keys so external integrations do not need user passwords.
