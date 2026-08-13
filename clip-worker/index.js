import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
      const { key, start, end } = await request.json();

      if (!key) {
        return Response.json(
          { error: "Video key is required" },
          { status: 400, headers: corsHeaders },
        );
      }

      if (
        typeof start !== "number" ||
        typeof end !== "number" ||
        end <= start
      ) {
        return Response.json(
          { error: "Valid start and end times are required" },
          { status: 400, headers: corsHeaders },
        );
      }

      const duration = end - start;

      if (duration < 1 || duration > 60) {
        return Response.json(
          {
            error: "Clip duration must be between 1 and 60 seconds",
          },
          { status: 400, headers: corsHeaders },
        );
      }

      console.log("CLIP REQUEST:", {
        key,
        start,
        end,
        duration,
      });

      const video = await env.VIDEO_BUCKET.get(key);

      if (!video) {
        return Response.json(
          { error: "Video not found" },
          { status: 404, headers: corsHeaders },
        );
      }

      console.log("VIDEO FOUND");

      const result = env.MEDIA.input(video.body).output({
        mode: "video",
        time: `${start}s`,
        duration: `${duration}s`,
        audio: true,
      });

      console.log("MEDIA TRANSFORMATION CREATED");

      const response = await result.response();

      console.log("MEDIA RESPONSE:", response.status, response.statusText);

      if (!response.ok) {
        throw new Error(
          `Media transformation failed: ${response.status} ${response.statusText}`,
        );
      }

      const clip = await response.arrayBuffer();

      console.log("CLIP RECEIVED:", clip.byteLength, "bytes");

      const clipKey = `clips/${crypto.randomUUID()}.mp4`;

      await env.VIDEO_BUCKET.put(clipKey, clip, {
        httpMetadata: {
          contentType: "video/mp4",
        },
      });

      console.log("CLIP SAVED:", clipKey);

      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
      const previewCommand = new GetObjectCommand({
        Bucket: "ai-clip-videos",
        Key: clipKey,
        ResponseContentType: "video/mp4",
      });

      const previewUrl = await getSignedUrl(s3, previewCommand, {
        expiresIn: 3600,
      });

      const downloadCommand = new GetObjectCommand({
        Bucket: "ai-clip-videos",
        Key: clipKey,
        ResponseContentType: "video/mp4",
        ResponseContentDisposition: `attachment; filename="ai-clip-${crypto.randomUUID()}.mp4"`,
      });

      const downloadUrl = await getSignedUrl(s3, downloadCommand, {
        expiresIn: 3600,
      });

      console.log("DOWNLOAD URL CREATED");

      return Response.json(
        {
          success: true,
          key: clipKey,
          previewUrl,
          downloadUrl,
        },
        {
          headers: corsHeaders,
        },
      );
    } catch (error) {
      console.error("CLIP WORKER ERROR:", error);

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
