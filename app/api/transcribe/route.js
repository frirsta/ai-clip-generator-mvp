import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createWorkersAI } from "workers-ai-provider";
import { experimental_transcribe } from "ai";

export async function POST(request) {
  const requestStart = performance.now();

  try {
    const { env } = getCloudflareContext();

    const formDataStart = performance.now();

    const formData = await request.formData();
    const audio = formData.get("audio");

    const formDataTime = performance.now() - formDataStart;

    console.log(
      `TRANSCRIBE: formData parsed in ${formDataTime.toFixed(0)}ms`,
    );

    if (!audio || typeof audio.arrayBuffer !== "function") {
      return Response.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    const audioStart = performance.now();

    const audioBuffer = await audio.arrayBuffer();

    const audioTime = performance.now() - audioStart;

    console.log(
      `TRANSCRIBE: audio read in ${audioTime.toFixed(0)}ms`,
    );

    if (audioBuffer.byteLength === 0) {
      return Response.json(
        { error: "Audio file is empty" },
        { status: 400 },
      );
    }

    console.log(
      `TRANSCRIBE: input size ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`,
    );

    console.log("TRANSCRIBE: starting Whisper...");

    const whisperStart = performance.now();

    const workersai = createWorkersAI({
      binding: env.AI,
    });

    const transcript = await experimental_transcribe({
      model: workersai.transcription(
        "@cf/openai/whisper-large-v3-turbo",
      ),
      audio: audioBuffer,
      mediaType: audio.type || "video/mp4",
    });

    const whisperTime = performance.now() - whisperStart;

    console.log(
      `TRANSCRIBE: Whisper completed in ${(whisperTime / 1000).toFixed(2)}s`,
    );

    const totalTime = performance.now() - requestStart;

    console.log(
      `TRANSCRIBE: TOTAL ${(totalTime / 1000).toFixed(2)}s`,
    );

    return Response.json({
      text: transcript.text,
      segments: transcript.segments,
    });
  } catch (error) {
    const totalTime = performance.now() - requestStart;

    console.error(
      `TRANSCRIBE: failed after ${(totalTime / 1000).toFixed(2)}s`,
    );

    console.error(error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}