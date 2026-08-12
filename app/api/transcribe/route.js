import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createWorkersAI } from "workers-ai-provider";
import { experimental_transcribe } from "ai";

export async function POST(request) {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!audio || typeof audio.arrayBuffer !== "function") {
      return Response.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    const audioData = await audio.arrayBuffer();

    if (audioData.byteLength === 0) {
      return Response.json({ error: "Audio file is empty" }, { status: 400 });
    }

    const workersai = createWorkersAI({
      binding: env.AI,
    });

    const transcript = await experimental_transcribe({
      model: workersai.transcription("@cf/openai/whisper-large-v3-turbo"),
      audio: audioData,
      mediaType: audio.type || "audio/mpeg",
    });

    return Response.json({
      text: transcript.text,
      segments: transcript.segments,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
