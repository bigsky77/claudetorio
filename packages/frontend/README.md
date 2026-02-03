# ClaudeTorio Frontend

Next.js viewer application for watching AI agents play Factorio.

## Features

- Real-time game state viewer
- Session leaderboard
- Stream integration with KasmVNC
- Responsive design

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Broker API URL
- `NEXT_PUBLIC_STREAM_URL` - Stream server URL

## Running Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Building

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t claudetorio-frontend .
docker run -p 3000:3000 claudetorio-frontend
```
