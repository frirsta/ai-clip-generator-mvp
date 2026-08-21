````md
# AI Clip Generator

AI Clip Generator is an MVP that uses AI to analyze uploaded videos and identify the best moments for short-form content.

The app combines video transcription and visual analysis to suggest clips based on both what is being said and what is happening on screen.

## Features

- Upload video files
- Upload videos directly to Cloudflare R2
- Transcribe videos using Whisper
- Analyze video frames using AI vision
- Combine transcript and visual analysis
- Automatically identify potential clips
- Generate clips from selected timestamps
- Preview generated clips
- Download generated clips

## Tech Stack

- Next.js
- React
- JavaScript
- Tailwind CSS
- Cloudflare Workers
- Cloudflare R2
- Cloudflare Media Transformations
- Cloudflare Workers AI

## How It Works

```text
Upload video
     ↓
Cloudflare R2
     ↓
Transcription
     ↓
Visual analysis
     ↓
AI clip analysis
     ↓
Suggested clips
     ↓
Generate clip
     ↓
Preview / Download
```
````

## Project Structure

```text
ai-clip-generator-mvp/
│
├── app/
│   ├── api/
│   │   ├── analyze-transcript/
│   │   ├── transcribe/
│   │   └── upload-url/
│   │
│   └── page.js
│
├── visual-worker/
│   └── index.js
│
├── clip-worker/
│   └── index.js
│
├── public/
├── package.json
└── README.md
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:3000
```

## Status

This project is currently an MVP and is under active development.

The core video-to-clip pipeline is working, including:

- Video upload
- Transcription
- Visual analysis
- AI clip selection
- Clip generation
- Clip preview
- Clip download


```
Future improvements will focus on improving clip selection, timestamp precision, subtitles, and publishing clips directly to social media platforms.
```
