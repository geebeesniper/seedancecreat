# External REST + GraphQL API

Both API styles use the **same** `ExternalVideoApiService`; there is no duplicate generation logic.

## 1. Configure API administration

Set a strong Vercel environment variable:

```text
API_ADMIN_SECRET=<random secret>
```

For production leave this false (default):

```text
EXTERNAL_API_AUTH_DISABLED=false
```

## 2. Create an API key

```bash
curl -X POST https://YOUR_DOMAIN/api/v1/api-keys \
  -H "x-api-admin-secret: YOUR_ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"name":"Flux","mode":"test","scopes":["videos:read","videos:write","models:read","wallet:read"]}'
```

The `sk_test_...` value is shown **once**. Store it in the Flux backend, not browser JavaScript.

## REST

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

Other REST endpoints:

- `GET /api/v1/videos`
- `POST /api/v1/videos/:id/cancel`
- `GET /api/v1/models`
- `GET /api/v1/wallet`
- `GET /openapi.json`

## GraphQL

Endpoint: `POST /api/graphql`

```graphql
mutation Generate($input: GenerateVideoInput!) {
  generateVideo(input: $input) {
    success
    code
    generation { id status videoUrl error }
  }
}
```

Variables:

```json
{
  "input": {
    "prompt": "cinematic tracking shot",
    "model": "seedance-2.5",
    "duration": 10,
    "resolution": "1080p"
  }
}
```

Queries include `videoGeneration`, `videoGenerations`, `models`, `wallet`, and `apiInfo`.

## Important current limitation

The external APIs are wired to the same legacy `GenerateVideo` dispatcher method as the GS-One UI. In the current TypeScript migration, that core method is still marked `NOT_MIGRATED_YET`. Therefore the REST/GraphQL layers are complete and authenticated, but actual generation will return an explicit error until the original `GenerateVideo` backend behavior is migrated or connected to the existing upstream generation implementation. This package does **not** invent or replace that upstream API.
