const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

export default {
  async fetch(request, env) {
    // --------------------------------------------------
    // CORS
    // --------------------------------------------------

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // --------------------------------------------------
      // GET
      // Serve generated clips from R2
      // --------------------------------------------------

      if (request.method === "GET") {
        const url = new URL(request.url);

        const key = url.searchParams.get("key");
        const download = url.searchParams.get("download") === "1";

        if (!key) {
          return jsonResponse(
            {
              error: "Clip key is required",
            },
            400,
          );
        }

        // Only allow generated clips to be served.
        if (!key.startsWith("clips/")) {
          return jsonResponse(
            {
              error: "Invalid clip key",
            },
            400,
          );
        }

        console.log("SERVING CLIP:", {
          key,
          download,
        });

        const object = await env.VIDEO_BUCKET.get(key);

        if (!object) {
          return jsonResponse(
            {
              error: "Clip not found",
            },
            404,
          );
        }

        const filename = key.split("/").pop() || "ai-clip.mp4";

        const headers = new Headers();

        headers.set("Content-Type", "video/mp4");

        headers.set("Cache-Control", "public, max-age=3600");

        headers.set("Access-Control-Allow-Origin", "http://localhost:3000");

        headers.set(
          "Access-Control-Expose-Headers",
          "Content-Disposition, Content-Length, Content-Range, Accept-Ranges",
        );

        // Allow video playback / seeking.
        headers.set("Accept-Ranges", "bytes");

        if (object.size) {
          headers.set("Content-Length", String(object.size));
        }

        if (download) {
          // Force browser to download the file.
          headers.set(
            "Content-Disposition",
            `attachment; filename="${filename}"`,
          );
        } else {
          // Play directly in the browser.
          headers.set("Content-Disposition", `inline; filename="${filename}"`);
        }

        return new Response(object.body, {
          status: 200,
          headers,
        });
      }

      // --------------------------------------------------
      // POST
      // Generate a clip
      // --------------------------------------------------

      if (request.method !== "POST") {
        return new Response("Method not allowed", {
          status: 405,
          headers: corsHeaders,
        });
      }

      const { key, start, end } = await request.json();

      // --------------------------------------------------
      // Validate request
      // --------------------------------------------------

      if (!key) {
        return jsonResponse(
          {
            error: "Video key is required",
          },
          400,
        );
      }

      if (
        typeof start !== "number" ||
        typeof end !== "number" ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start
      ) {
        return jsonResponse(
          {
            error: "Valid start and end times are required",
          },
          400,
        );
      }

      const duration = end - start;

      if (duration < 1 || duration > 60) {
        return jsonResponse(
          {
            error: "Clip duration must be between 1 and 60 seconds",
          },
          400,
        );
      }

      console.log("CLIP REQUEST:", {
        key,
        start,
        end,
        duration,
      });

      // --------------------------------------------------
      // Get original video from R2
      // --------------------------------------------------

      const video = await env.VIDEO_BUCKET.get(key);

      if (!video) {
        return jsonResponse(
          {
            error: "Video not found",
          },
          404,
        );
      }

      console.log("VIDEO FOUND");

      // --------------------------------------------------
      // Create media transformation
      // --------------------------------------------------

      const result = env.MEDIA.input(video.body).output({
        mode: "video",
        time: `${start}s`,
        duration: `${duration}s`,
        audio: true,
      });

      console.log("MEDIA TRANSFORMATION CREATED");

      // --------------------------------------------------
      // Run transformation
      // --------------------------------------------------

      const response = await result.response();

      console.log("MEDIA RESPONSE:", response.status, response.statusText);

      if (!response.ok) {
        throw new Error(
          `Media transformation failed: ${response.status} ${response.statusText}`,
        );
      }

      // --------------------------------------------------
      // Read generated clip
      // --------------------------------------------------

      const clip = await response.arrayBuffer();

      console.log("CLIP RECEIVED:", clip.byteLength, "bytes");

      // --------------------------------------------------
      // Save generated clip to R2
      // --------------------------------------------------

      const clipKey = `clips/${crypto.randomUUID()}.mp4`;

      await env.VIDEO_BUCKET.put(clipKey, clip, {
        httpMetadata: {
          contentType: "video/mp4",
        },
      });

      console.log("CLIP SAVED:", clipKey);

      // --------------------------------------------------
      // Create URLs served by this Worker
      // --------------------------------------------------

      const workerUrl = new URL(request.url).origin;

      const previewUrl = `${workerUrl}/?key=${encodeURIComponent(clipKey)}`;

      const downloadUrl = `${workerUrl}/?key=${encodeURIComponent(clipKey)}&download=1`;

      console.log("CLIP URLS CREATED");

      // --------------------------------------------------
      // Return result
      // --------------------------------------------------

      return jsonResponse({
        success: true,
        key: clipKey,
        previewUrl,
        downloadUrl,
      });
    } catch (error) {
      console.error("CLIP WORKER ERROR:", error);

      return jsonResponse(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
};
