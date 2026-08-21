import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request) {
  try {
    const { env } = getCloudflareContext();

    const { key } = await request.json();

    if (!key) {
      return Response.json(
        { error: "Video key is required" },
        { status: 400 },
      );
    }

    const video = await env.VIDEO_BUCKET.get(key);

    if (!video) {
      return Response.json(
        { error: "Video not found" },
        { status: 404 },
      );
    }

    console.log("VIDEO FOUND");

    const frameResponse = await env.MEDIA
      .input(video.body)
      .transform({
        width: 640,
        height: 360,
      })
      .output({
        mode: "frame",
        time: "0s",
        format: "jpg",
      })
      .response();

    if (!frameResponse.ok) {
      throw new Error(
        `Frame extraction failed: ${frameResponse.status} ${frameResponse.statusText}`,
      );
    }

    const frameBuffer = await frameResponse.arrayBuffer();

    console.log(
      "FRAME EXTRACTED:",
      frameBuffer.byteLength,
      "bytes",
    );

    const base64 = Buffer.from(frameBuffer).toString("base64");

    const image = `data:image/jpeg;base64,${base64}`;

    const result = await env.AI.run(
      "@cf/meta/llama-3.2-11b-vision-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a video editor analyzing a frame from a video. Describe the important visual elements, actions, people, objects, reactions, text, and anything else that could help identify an engaging short-form video moment.",
          },
          {
            role: "user",
            content:
              "What is visually happening in this frame? Be specific.",
          },
        ],
        image,
        max_tokens: 300,
        temperature: 0.2,
      },
    );

    console.log("VISION RESULT:", result);

    return Response.json({
      key,
      visualAnalysis: result.response,
    });
  } catch (error) {
    console.error("VISUAL ANALYSIS ERROR:", error);

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