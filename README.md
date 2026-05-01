# Role Calculator

Small client-server calculator with role-based authorization.

## Accounts

- `Vasya` / `12345` - administrator, can use `+`, `-`, `*`, `/`
- `Petya` / `12345` - user, can use only `+`, `-`

## Local Run

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

API docs:

```text
http://localhost:3000/docs
```

OpenAPI JSON:

```text
http://localhost:3000/openapi.json
```

If your environment has npm:

```bash
npm start
```

## Deploy

This app does not need external packages. Most Node.js hosts can run it with:

```bash
npm start
```

For Render/Railway/Fly.io:

- build command: leave empty or use `npm install`
- start command: `npm start`
- port: use the platform-provided `PORT` environment variable

The server already reads `process.env.PORT`, so the same code works locally and on hosting.
