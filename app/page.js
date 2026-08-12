"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  async function uploadVideo() {
    if (!file) return;

    try {
      setStatus("Preparing upload...");

      const response = await fetch("/api/upload-url");

      if (!response.ok) {
        throw new Error("Could not create upload URL");
      }

      const { uploadUrl } = await response.json();

      setStatus("Uploading...");

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

      setStatus("Upload complete!");
    } catch (error) {
      console.error(error);
      setStatus("Upload failed.");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">AI Clip Generator</h1>

      <input
        type="file"
        accept="video/mp4"
        onChange={(event) => setFile(event.target.files?.[0] || null)}
      />

      <button
        onClick={uploadVideo}
        disabled={!file}
        className="rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        Upload Video
      </button>

      {status && <p>{status}</p>}
    </main>
  );
}
