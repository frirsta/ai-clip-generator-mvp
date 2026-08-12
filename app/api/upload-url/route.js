import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function GET() {
  const key = `videos/${crypto.randomUUID()}.mp4`;

  const command = new PutObjectCommand({
    Bucket: "ai-clip-videos",
    Key: key,
    ContentType: "video/mp4",
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: 600,
  });

  return Response.json({
    uploadUrl,
    key,
  });
}
