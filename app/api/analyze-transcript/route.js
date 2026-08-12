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
The start and end times must fall within an actual timestamped segment.

Return exactly 3 clip suggestions.

Return JSON in this format:

{
  "clips": [
    {
      "start": 0,
      "end": 30,
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

    return Response.json(response.response);
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
