# External REST + GraphQL API

GS-One now has **two authentication layers**:

1. `gs_session_...` — first-party browser/user session after login.
2. `sk_test_...` / `sk_live_...` — API keys for Flux or other server-to-server integrations.

Do not put an API key in Flux browser JavaScript. Keep it in the Flux backend.

## User login API

REST:

```bash
curl -X POST https://YOUR_DOMAIN/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"identifier":"jeremy","password":"YOUR_PASSWORD"}'
```

Registration (when `ALLOW_SIGNUP=true`):

```bash
curl -X POST https://YOUR_DOMAIN/api/v1/auth/register \
  -H "content-type: application/json" \
  -d '{"username":"jeremy","email":"me@example.com","password":"YOUR_PASSWORD"}'
```

The response returns a `gs_session_...` bearer token. Use it with:

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET/POST/DELETE /api/v1/api-keys`
- first-party `/api/app/*`, payment, and local-video queue endpoints

GraphQL also exposes `register`, `login`, `authMe`, and `logout`.

## Create an API key for Flux

A signed-in user can create their own key:

```bash
curl -X POST https://YOUR_DOMAIN/api/v1/api-keys \
  -H "Authorization: Bearer gs_session_xxx" \
  -H "content-type: application/json" \
  -d '{"name":"Flux","mode":"test","scopes":["videos:read","videos:write","models:read","wallet:read"]}'
```

The `sk_test_...` value is shown **once**.

An `API_ADMIN_SECRET` path is still available for operations/bootstrap.

## REST video API

```bash
curl -X POST https://YOUR_DOMAIN/api/v1/videos/generate \
  -H "Authorization: Bearer sk_test_xxx" \
  -H "content-type: application/json" \
  -d '{"prompt":"cinematic tracking shot","model":"seedance-2.5","duration":10,"resolution":"1080p"}'
```

```bash
curl https://YOUR_DOMAIN/api/v1/videos/GENERATION_ID \
  -H "Authorization: Bearer sk_test_xxx"
```

Other endpoints:

- `GET /api/v1/videos`
- `POST /api/v1/videos/:id/cancel`
- `GET /api/v1/models`
- `GET /api/v1/wallet`
- `GET /openapi.json`

## GraphQL

Endpoint: `POST /api/graphql`

Login example:

```graphql
mutation {
  login(identifier: "jeremy", password: "YOUR_PASSWORD") {
    token
    expiresAt
    user { id username email }
  }
}
```

Video generation example (API key required):

```graphql
mutation Generate($input: GenerateVideoInput!) {
  generateVideo(input: $input) {
    success
    code
    generation { id status videoUrl error }
  }
}
```

## Important current limitation

REST and GraphQL share the same `ExternalVideoApiService`, but the migrated TypeScript core still has the original `GenerateVideo` dispatcher method marked `NOT_MIGRATED_YET`. The API layer does not fake success. Actual video generation still requires the original generation behavior to be migrated/connected.
