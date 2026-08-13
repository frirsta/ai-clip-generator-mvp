import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request) {
  try {
    const { env } = getCloudflareContext();

    const { transcript, segments } = await request.json();

    if (!transcript) {
      return Response.json(
        { error: "Transcript is required" },
        { status: 400 },
      );
    }

    const videoDuration =
      Array.isArray(segments) && segments.length
        ? Math.max(...segments.map((segment) => Number(segment.end) || 0))
        : 0;

    const timestampedTranscript = segments?.length
      ? segments
          .map((segment, index) => {
            return `[segment ${index}] [${segment.start}s - ${segment.end}s] ${segment.text}`;
          })
          .join("\n")
      : transcript;

    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        {
          role: "system",
          content: `You are an expert short-form video editor.

Your task is to identify the strongest moments in a video that could become engaging short-form clips.

Available video duration:
${videoDuration} seconds

Prioritize moments with:
- A strong hook near the beginning
- A clear setup
- A payoff, punchline, reveal, reaction, conclusion, or emotional peak
- Interesting, funny, surprising, dramatic, controversial, or relatable content
- Minimal dead air or unnecessary context

CLIP LENGTH:
- Prefer clips between 15 and 45 seconds.
- Clips may be shorter than 15 seconds when the moment has a very strong payoff.
- Never exceed 45 seconds.
- NEVER use an end timestamp greater than ${videoDuration}.
- NEVER use a start timestamp greater than or equal to ${videoDuration}.

TIMING RULES:
- Use ONLY timestamps from the provided transcript.
- Start and end must match actual segment boundaries.
- Do NOT invent timestamps.
- Do not cut a sentence in half when avoidable.
- The complete clip must fit inside the video.

DIVERSITY:
- Return different moments.
- Avoid overlapping clips whenever possible.
- Do not return multiple clips covering essentially the same event.

Return exactly 3 clip suggestions.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside the JSON.

Use exactly this structure:

{
  "clips": [
    {
      "start": 0,
      "end": 10,
      "title": "Short engaging title",
      "reason": "Why this moment is strong",
      "score": 9
    }
  ]
}

Score:
1-3 = weak
4-5 = average
6-7 = good
8-9 = very strong
10 = exceptional`,
        },
        {
          role: "user",
          content: `Analyze this timestamped transcript and select the 3 strongest short-form clips:

${timestampedTranscript}`,
        },
      ],
      max_tokens: 1200,
      temperature: 0.2,
    });

    let analysis = response.response;

    if (typeof analysis === "string") {
      try {
        analysis = JSON.parse(analysis);
      } catch {
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
      return Response.json(
        {
          error: "AI did not return valid clip suggestions",
          raw: analysis,
        },
        { status: 500 },
      );
    }

    const validClips = analysis.clips
      .filter((clip) => {
        if (
          typeof clip.start !== "number" ||
          typeof clip.end !== "number" ||
          typeof clip.title !== "string" ||
          typeof clip.reason !== "string" ||
          typeof clip.score !== "number"
        ) {
          return false;
        }

        if (clip.end <= clip.start) {
          return false;
        }

        if (clip.end - clip.start > 45) {
          return false;
        }

        if (videoDuration > 0 && clip.end > videoDuration) {
          return false;
        }

        if (clip.start < 0) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.score - a.score);

    const selectedClips = [];

    for (const clip of validClips) {
      const overlaps = selectedClips.some((selected) => {
        const latestStart = Math.max(selected.start, clip.start);

        const earliestEnd = Math.min(selected.end, clip.end);

        return latestStart < earliestEnd;
      });

      if (!overlaps) {
        selectedClips.push(clip);
      }

      if (selectedClips.length === 3) {
        break;
      }
    }

    return Response.json({
      clips: selectedClips,
      videoDuration,
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
