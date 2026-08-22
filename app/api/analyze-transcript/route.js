import { getCloudflareContext } from "@opennextjs/cloudflare";
import { corsHeaders, handleCors } from "@/lib/cors";

function calculateClipBoundaries(visualEventTime, segments, duration) {
  if (!Array.isArray(segments) || !segments.length) {
    const start = Math.max(0, visualEventTime - 4);
    const end = Math.min(duration, visualEventTime + 4);

    return {
      start,
      end,
    };
  }

  const normalizedSegments = segments
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      text: segment.text || "",
    }))
    .filter(
      (segment) =>
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end > segment.start,
    );

  if (!normalizedSegments.length) {
    const start = Math.max(0, visualEventTime - 4);
    const end = Math.min(duration, visualEventTime + 4);

    return {
      start,
      end,
    };
  }

  // Segment containing the visual event.
  const eventIndex = normalizedSegments.findIndex(
    (segment) =>
      visualEventTime >= segment.start && visualEventTime <= segment.end,
  );

  let centerIndex = eventIndex;

  // If no segment contains the event, find the closest segment.
  if (centerIndex === -1) {
    centerIndex = normalizedSegments.reduce((closestIndex, segment, index) => {
      const closest = normalizedSegments[closestIndex];

      const currentDistance = Math.abs(segment.start - visualEventTime);

      const closestDistance = Math.abs(closest.start - visualEventTime);

      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);
  }

  // Start with approximately 1–2 transcript segments
  // before the visual event.
  const startIndex = Math.max(0, centerIndex - 2);

  // Include the event segment and up to 2
  // segments afterwards for the payoff.
  const endIndex = Math.min(normalizedSegments.length - 1, centerIndex + 2);

  let start = normalizedSegments[startIndex].start;
  let end = normalizedSegments[endIndex].end;

  // Never exceed the actual video duration.
  start = Math.max(0, start);
  end = Math.min(duration, end);

  // Maximum clip length.
  if (end - start > 45) {
    end = start + 45;
  }

  // If the resulting clip is extremely short,
  // expand slightly around the event.
  if (end - start < 8) {
    if (visualEventTime <= 4) {
      start = 0;
      end = Math.min(duration, 10);
    } else if (visualEventTime >= duration - 4) {
      start = Math.max(0, duration - 10);
      end = duration;
    } else {
      start = Math.max(0, visualEventTime - 4);
      end = Math.min(duration, visualEventTime + 5);
    }
  }

  return {
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
  };
}
export async function OPTIONS(request) {
  return handleCors(request);
}

export async function POST(request) {
  try {
    const { env } = getCloudflareContext();

    const { transcript, segments, visualAnalysis, videoDuration } =
      await request.json();

    if (!transcript) {
      return Response.json(
        { error: "Transcript is required" },
        {
          status: 400,
          headers: corsHeaders(request),
        },
      );
    }

    const duration = Number(videoDuration);

    if (!Number.isFinite(duration) || duration <= 0) {
      return Response.json(
        { error: "Valid video duration is required" },
        {
          status: 400,
          headers: corsHeaders(request),
        },
      );
    }

    const timestampedTranscript =
      Array.isArray(segments) && segments.length
        ? segments
            .map((segment, index) => {
              return `[segment ${index}] [${segment.start}s - ${segment.end}s] ${segment.text}`;
            })
            .join("\n")
        : transcript;

    const timestampedVisualAnalysis =
      Array.isArray(visualAnalysis) && visualAnalysis.length
        ? visualAnalysis
            .map((frame) => {
              return `[${Number(frame.time).toFixed(2)}s]
Event: ${frame.event}
Type: ${frame.type}
Intensity: ${frame.intensity}/10
Description: ${frame.description}`;
            })
            .join("\n\n")
        : "No visual analysis available.";

    const visualEvents = Array.isArray(visualAnalysis)
      ? visualAnalysis
          .filter(
            (frame) =>
              Number.isFinite(Number(frame.time)) &&
              Number.isFinite(Number(frame.intensity)),
          )
          .map((frame) => ({
            time: Number(frame.time),
            event: frame.event,
            type: frame.type,
            intensity: Number(frame.intensity),
            description: frame.description,
          }))
      : [];

    console.log("ANALYZE: video duration =", duration);

    console.log(
      "ANALYZE: visual frames =",
      Array.isArray(visualAnalysis) ? visualAnalysis.length : 0,
    );

    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        {
          role: "system",
          content: `You are an expert short-form video editor.

Your job is to identify the strongest moments from a video using BOTH the spoken transcript AND visual information from the actual video.

VIDEO DURATION:
${duration.toFixed(2)} seconds

IMPORTANT:
Do NOT choose clips based only on the transcript.

You must consider:
1. What is being said.
2. What is visually happening.
3. Whether the spoken and visual moments reinforce each other.

STRONG VISUAL MOMENTS INCLUDE:
- Facial reactions
- Emotional reactions
- Gameplay events
- Sudden visual changes
- Characters appearing or disappearing
- Objects appearing
- On-screen text
- Alerts or notifications
- UI changes
- Funny or unexpected visuals
- Physical reactions
- Reveals
- Visually unusual moments

STRONG SPOKEN MOMENTS INCLUDE:
- Hooks
- Surprising statements
- Punchlines
- Stories
- Strong opinions
- Emotional statements
- Questions and answers
- Reveals
- Conclusions

THE BEST CLIPS often combine BOTH a strong spoken moment and a strong visual moment.

CLIP LENGTH:

- Prefer the shortest clip that contains the complete setup, event and payoff.
- Typical clips should be 10–35 seconds.
- Clips can be shorter than 10 seconds when the visual or spoken moment is strong enough.
- Longer clips are allowed up to 45 seconds only when necessary for context.
- Never exceed 45 seconds.
- Never exceed the actual video duration.

TIMING:

Use transcript segment timestamps whenever possible.

The visual event timestamp tells you approximately WHERE the important visual moment happens.

Do NOT automatically use the visual event timestamp as the clip start.

Instead, build the clip around the event:

1. Find the relevant visual event.
2. Find the transcript segment containing or immediately preceding that event.
3. Start the clip early enough to establish context.
4. Include the visual event.
5. Include the reaction or payoff after the event when appropriate.

For a strong reaction near the end of a video, include several seconds before the reaction if that footage provides useful context.

The clip should feel like a complete moment:

SETUP → EVENT → PAYOFF

Do NOT include unnecessary footage.

Typical setup:
- 2–8 seconds before the main event.

Typical payoff:
- 1–5 seconds after the main event.

For very strong events, a shorter setup is acceptable.

For weak events, do not artificially extend the clip.

VISUAL EVENT SCORING:

Visual events have an intensity score from 1–10.

Give significantly more weight to visual events with intensity 7–10.

A visual event with intensity 8–10 is a strong candidate.

A visual event with intensity 1–3 should NOT be enough by itself to justify a clip.

Use the visual event timestamp to locate the important moment, but use the transcript timestamps to determine the best clip boundaries.

The final clip should contain the complete setup, event and payoff whenever possible.

VISUAL EVENT TIME:

Every selected clip MUST include a "visualEventTime".

visualEventTime MUST correspond exactly to the "time" value of one of the visual events provided in the VISUAL EVENTS data.

Do NOT invent a visualEventTime.

The visualEventTime must fall inside the selected clip.

The visual event timestamp represents approximately WHERE the important visual event happens.

The clip START should normally be BEFORE visualEventTime.

The clip END should normally be AFTER visualEventTime when there is a meaningful reaction or payoff.

DIVERSITY:
- Select genuinely different moments.
- Avoid overlapping clips.
- Do not select multiple clips from the same event unless there is a very strong reason.

RANKING:

Score each clip from 1 to 10.

10 = exceptional short-form potential
8–9 = very strong
6–7 = good
4–5 = average
1–3 = weak

Return ONLY valid JSON.

Use exactly this structure:

{
  "clips": [
    {
      "start": 0,
      "end": 20,
      "title": "Short engaging title",
      "reason": "Why this moment is strong based on both spoken and visual content",
      "visualEvent": "The specific visual event that makes this moment interesting",
      "visualEventTime": 20.5,
      "score": 9
    }
  ]
}

Return up to 3 clips.`,
        },
        {
          role: "user",
          content: `TRANSCRIPT:

${timestampedTranscript}

VISUAL EVENTS:

${JSON.stringify(visualEvents, null, 2)}

DETAILED VISUAL ANALYSIS:

${timestampedVisualAnalysis}

Select the strongest short-form video moments using BOTH sources of information.

For every selected clip:
- Identify the important visual event.
- Use the exact timestamp of that visual event as visualEventTime.
- Locate the event in time.
- Look at the transcript immediately before and after the event.
- Start early enough to provide context.
- Include the event.
- Include the payoff/reaction.
- Avoid unnecessary footage.

Think:

SETUP → EVENT → PAYOFF

Do not simply use the visual event timestamp as the clip start.`,
        },
      ],
      max_tokens: 1400,
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
          } catch {
            return Response.json(
              {
                error: "AI returned invalid JSON",
                raw: analysis,
              },
              { status: 500, headers: corsHeaders(request) },
            );
          }
        } else {
          return Response.json(
            {
              error: "AI returned invalid JSON",
              raw: analysis,
            },
            { status: 500, headers: corsHeaders(request) },
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
        { status: 500, headers: corsHeaders(request) },
      );
    }

    const validClips = analysis.clips
      .filter((clip) => {
        if (
          typeof clip.start !== "number" ||
          typeof clip.end !== "number" ||
          typeof clip.title !== "string" ||
          typeof clip.reason !== "string" ||
          typeof clip.visualEvent !== "string" ||
          typeof clip.visualEventTime !== "number" ||
          typeof clip.score !== "number"
        ) {
          return false;
        }

        if (clip.visualEventTime < 0 || clip.visualEventTime > duration) {
          return false;
        }

        if (clip.score < 1 || clip.score > 10) {
          return false;
        }

        return true;
      })
      .map((clip) => {
        const boundaries = calculateClipBoundaries(
          clip.visualEventTime,
          segments,
          duration,
        );

        return {
          ...clip,
          start: boundaries.start,
          end: boundaries.end,
        };
      })
      .filter((clip) => {
        if (clip.end <= clip.start) {
          return false;
        }

        if (clip.end - clip.start > 45) {
          return false;
        }

        if (
          clip.visualEventTime < clip.start ||
          clip.visualEventTime > clip.end
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.score - a.score);

    const selectedClips = [];

    for (const clip of validClips) {
      const overlaps = selectedClips.some((selected) => {
        const overlapStart = Math.max(selected.start, clip.start);

        const overlapEnd = Math.min(selected.end, clip.end);

        return overlapStart < overlapEnd;
      });

      if (!overlaps) {
        selectedClips.push(clip);
      }

      if (selectedClips.length === 3) {
        break;
      }
    }

    console.log("SELECTED CLIPS:", selectedClips);

    return Response.json(
      {
        clips: selectedClips,
        videoDuration: duration,
      },
      {
        headers: corsHeaders(request),
      },
    );
  } catch (error) {
    console.error("ANALYZE TRANSCRIPT ERROR:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}
