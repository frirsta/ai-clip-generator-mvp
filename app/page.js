"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState("");

  async function uploadVideo() {
    if (!file) return;

    try {
      setStatus("Preparing upload...");
      setTranscript("");

      // 1. Get a presigned R2 upload URL
      const response = await fetch("/api/upload-url");

      if (!response.ok) {
        throw new Error("Could not create upload URL");
      }

      const { uploadUrl } = await response.json();

      // 2. Upload the video to R2
      setStatus("Uploading video...");

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      // 3. Transcribe the same video
      setStatus("Transcribing video...");

      const formData = new FormData();
      formData.append("audio", file);

      const transcribeResponse = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const result = await transcribeResponse.json();

      if (!transcribeResponse.ok) {
        throw new Error(result.error || "Transcription failed");
      }

      console.log("VIDEO TRANSCRIPTION:", result);

      setTranscript(result.text || "");
      setStatus("Transcription complete!");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Something went wrong.");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">AI Clip Generator</h1>

      <input
        type="file"
        accept="video/mp4"
        onChange={(event) =>
          setFile(event.target.files?.[0] || null)
        }
      />

      <button
        onClick={uploadVideo}
        disabled={!file}
        className="rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        Upload Video
      </button>

      {status && <p>{status}</p>}

      {transcript && (
        <div className="w-full max-w-2xl rounded-lg border p-4">
          <h2 className="mb-2 font-bold">Transcript</h2>
          <p>{transcript}</p>
        </div>
      )}
    </main>
  );
}