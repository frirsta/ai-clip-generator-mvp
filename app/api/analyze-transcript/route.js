import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request) {
  try {
    const { env } = await getCloudflareContext({ async: true });

    const { transcript, segments } = await request.json();

    if (!transcript) {
      return Response.json(
        { error: "Transcript is required" },
        { status: 400 },
      );
    }

    const timestampedTranscript = segments?.length
      ? segments
          .map((segment) => {
            return `[${segment.start}s - ${segment.end}s] ${segment.text}`;
          })
          .join("\n")
      : transcript;

    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        {
          role: "system",
          content: `You are an AI clip editor.

Analyze a timestamped video transcript and identify the 3 best moments for short-form video clips.

Look for:
- Funny moments
- Surprising moments
- Strong reactions
- Interesting statements
- Emotional moments
- Controversial or attention-grabbing statements
- Moments with a clear beginning and payoff
- Moments that would make someone want to watch the clip

IMPORTANT:
Use ONLY timestamps that appear in the provided transcript.
Do not invent timestamps.

Return exactly 3 clip suggestions.

Return ONLY valid JSON.
Do not include any explanation, introduction, markdown, or text outside the JSON.

The JSON must have this exact structure:

{
  "clips": [
    {
      "start": 0,
      "end": 10,
      "title": "Short engaging title",
      "reason": "Why this moment would make a good short-form clip"
    }
  ]
}

The start and end values must be numbers representing seconds.`,
        },
        {
          role: "user",
          content: `Find the 3 best clips from this timestamped transcript:

${timestampedTranscript}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    let analysis = response.response;

    // If the AI returned a JSON string, parse it.
    if (typeof analysis === "string") {
      try {
        analysis = JSON.parse(analysis);
      } catch {
        // The model sometimes adds text before the JSON.
        // Try extracting the JSON object.
        const firstBrace = analysis.indexOf("{");
        const lastBrace = analysis.lastIndexOf("}");

        if (firstBrace !== -1 && lastBrace !== -1) {
          const jsonText = analysis.slice(firstBrace, lastBrace + 1);

          try {
            analysis = JSON.parse(jsonText);
          } catch (error) {
            console.error("Could not parse extracted AI response:", analysis);

            return Response.json(
              {
                error: "AI returned invalid JSON",
                raw: analysis,
              },
              { status: 500 },
            );
          }
        } else {
          console.error("Could not find JSON in AI response:", analysis);

          return Response.json(
            {
              error: "AI returned invalid JSON",
              raw: analysis,
            },
            { status: 500 },
          );
        }
      }
    }

    if (!analysis || !Array.isArray(analysis.clips)) {
      console.error("Unexpected AI response:", analysis);

      return Response.json(
        {
          error: "AI did not return valid clip suggestions",
          raw: analysis,
        },
        { status: 500 },
      );
    }

    // Keep only valid clips.
    const validClips = analysis.clips.filter((clip) => {
      return (
        typeof clip.start === "number" &&
        typeof clip.end === "number" &&
        clip.end > clip.start &&
        typeof clip.title === "string" &&
        typeof clip.reason === "string"
      );
    });

    if (validClips.length === 0) {
      return Response.json(
        {
          error: "AI did not return any valid clips",
          raw: analysis,
        },
        { status: 500 },
      );
    }

    return Response.json({
      clips: validClips.slice(0, 3),
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
