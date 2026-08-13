"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [clips, setClips] = useState([]);
  const [videoKey, setVideoKey] = useState("");
  const [generatingClip, setGeneratingClip] = useState(null);
  const [generatedClips, setGeneratedClips] = useState({});

  async function uploadVideo() {
    if (!file) return;

    try {
      setStatus("Preparing upload...");
      setTranscript("");
      setClips([]);
      setGeneratedClips({});

      const uploadUrlResponse = await fetch("/api/upload-url");

      if (!uploadUrlResponse.ok) {
        throw new Error("Could not create upload URL");
      }

      const { uploadUrl, key } = await uploadUrlResponse.json();

      setVideoKey(key);

      setStatus("Uploading video...");

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      setStatus("Transcribing video...");

      const formData = new FormData();
      formData.append("audio", file);

      const transcribeResponse = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const transcription = await transcribeResponse.json();

      if (!transcribeResponse.ok) {
        throw new Error(transcription.error || "Transcription failed");
      }

      setTranscript(transcription.text || "");

      setStatus("Finding the best clips...");

      const analyzeResponse = await fetch("/api/analyze-transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: transcription.text,
          segments: transcription.segments,
        }),
      });

      const analysis = await analyzeResponse.json();

      if (!analyzeResponse.ok) {
        throw new Error(analysis.error || "Clip analysis failed");
      }

      setClips(analysis.clips || []);
      setStatus("Analysis complete!");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Something went wrong.");
    }
  }

  async function generateClip(clip, index) {
    if (!videoKey) {
      setStatus("Video key is missing.");
      return;
    }

    try {
      setGeneratingClip(index);
      setStatus(`Generating clip ${index + 1}...`);

      const response = await fetch("/api/generate-clip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: videoKey,
          start: Number(clip.start),
          end: Number(clip.end),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not generate clip");
      }

      setGeneratedClips((previous) => ({
        ...previous,
        [index]: result.downloadUrl,
      }));

      setStatus(`Clip ${index + 1} generated!`);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Clip generation failed.");
    } finally {
      setGeneratingClip(null);
    }
  }

  function formatTime(seconds) {
    const totalSeconds = Math.floor(Number(seconds));

    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8">
      <div className="w-full max-w-3xl pt-12">
        <h1 className="text-4xl font-bold">AI Clip Generator</h1>

        <p className="mt-2 text-gray-600">
          Upload a video and let AI find the best moments.
        </p>

        <div className="mt-8 rounded-xl border p-6">
          <input
            type="file"
            accept="video/mp4,video/quicktime"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="w-full"
          />

          <button
            onClick={uploadVideo}
            disabled={!file}
            className="mt-4 rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
          >
            Analyze Video
          </button>

          {status && <p className="mt-4 text-sm text-gray-600">{status}</p>}
        </div>

        {transcript && (
          <div className="mt-8 rounded-xl border p-6">
            <h2 className="text-xl font-bold">Transcript</h2>

            <p className="mt-3 whitespace-pre-wrap text-gray-700">
              {transcript}
            </p>
          </div>
        )}

        {clips.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold">Best Clips</h2>

            <div className="mt-4 space-y-4">
              {clips.map((clip, index) => (
                <div key={index} className="rounded-xl border p-5">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-bold">{clip.title}</h3>

                    <span className="text-sm text-gray-500">
                      {formatTime(clip.start)} → {formatTime(clip.end)}
                    </span>
                  </div>

                  <p className="mt-2 text-gray-600">{clip.reason}</p>

                  <button
                    onClick={() => generateClip(clip, index)}
                    disabled={generatingClip !== null}
                    className="mt-4 rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {generatingClip === index
                      ? "Generating..."
                      : "Generate Clip"}
                  </button>

                  {generatedClips[index] && (
                    <div className="mt-5">
                      <video
                        controls
                        className="w-full rounded-lg"
                        src={generatedClips[index]}
                      />

                      <a
                        href={generatedClips[index]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-sm underline"
                      >
                        Open generated clip
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
