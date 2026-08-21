const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const { key, videoDuration } = await request.json();

      if (!key) {
        return Response.json(
          { error: "Video key is required" },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }

      if (
        typeof videoDuration !== "number" ||
        !Number.isFinite(videoDuration) ||
        videoDuration <= 0
      ) {
        return Response.json(
          {
            error: "Valid video duration is required",
          },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }

      const frameCount = 6;

      // Leave one second of safety margin at the end.
      const safeDuration = Math.max(0, videoDuration - 1);

      const times = Array.from({ length: frameCount }, (_, index) => {
        if (frameCount === 1) {
          return 0;
        }

        return (safeDuration * index) / (frameCount - 1);
      });

      console.log("VIDEO DURATION:", videoDuration);

      console.log("FRAME TIMES:", times);

      const visualAnalysis = [];

      for (const time of times) {
        console.log(`ANALYZING FRAME AT ${time.toFixed(2)}s`);

        const video = await env.VIDEO_BUCKET.get(key);

        if (!video) {
          throw new Error("Video not found");
        }

        const frameResponse = await env.MEDIA.input(video.body)
          .output({
            mode: "frame",
            time: `${time.toFixed(3)}s`,
            format: "jpg",
          })
          .response();

        if (!frameResponse.ok) {
          throw new Error(
            `Frame extraction failed at ${time.toFixed(
              2,
            )}s: ${frameResponse.status} ${frameResponse.statusText}`,
          );
        }

        const frameBuffer = await frameResponse.arrayBuffer();

        console.log(`FRAME EXTRACTED: ${frameBuffer.byteLength} bytes`);

        const base64 = Buffer.from(frameBuffer).toString("base64");

        const image = `data:image/jpeg;base64,${base64}`;

        const visionResult = await env.AI.run(
          "@cf/meta/llama-3.2-11b-vision-instruct",
          {
            messages: [
              {
                role: "system",
                content: `You are analyzing a frame from a video to help an AI editor find viral short-form clips.

Do NOT write a general description of the image.

Instead, identify the most important VISUAL EVENT happening at this exact moment.

Focus on:
- Facial reactions
- Emotional reactions
- People entering or leaving
- Sudden movements
- Gameplay events
- Important actions
- Objects appearing or changing
- On-screen text
- Notifications or alerts
- UI changes
- Reveals
- Funny moments
- Surprising moments
- Visually unusual events

If nothing meaningful is happening, say so.

Return ONLY valid JSON using exactly this structure:

{
  "event": "short description of the visual event",
  "type": "reaction | gameplay | action | reveal | text | notification | UI_change | appearance | movement | other | none",
  "intensity": 1,
  "description": "brief explanation of what is visually happening"
}

Intensity:
1 = nothing interesting
2–3 = minor visual event
4–5 = noticeable
6–7 = interesting
8–9 = very strong
10 = exceptional visual moment

Be objective. Do not invent events that are not visible.`,
              },
              {
                role: "user",
                content:
                  "Identify the most important visual event happening in this frame.",
              },
            ],
            image,
            max_tokens: 200,
            temperature: 0.1,
          },
        );

        let analysis;

        try {
          analysis = JSON.parse(visionResult.response);
        } catch {
          analysis = {
            event: "unknown",
            type: "other",
            intensity: 1,
            description: visionResult.response || "Could not analyze frame.",
          };
        }

        visualAnalysis.push({
          time,
          ...analysis,
        });
      }

      console.log("VISUAL EVENTS:", visualAnalysis);

      return Response.json(
        {
          key,
          videoDuration,
          frames: visualAnalysis,
        },
        {
          headers: corsHeaders,
        },
      );
    } catch (error) {
      console.error("VISUAL WORKER ERROR:", error);

      return Response.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }
  },
};
