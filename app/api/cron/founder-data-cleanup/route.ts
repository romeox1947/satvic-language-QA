import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getB2Client, getB2Config } from '@/lib/b2/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { bucket } = getB2Config();
    const client = getB2Client();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const expired: { Key: string }[] = [];
    for (const prefix of ['founder-office-data/', 'user-notifications/']) {
      let continuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }));
        for (const item of page.Contents ?? []) {
          if (item.Key && item.LastModified && item.LastModified.getTime() < cutoff) expired.push({ Key: item.Key });
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
    }

    for (let index = 0; index < expired.length; index += 1000) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: expired.slice(index, index + 1000), Quiet: true } }));
    }
    return Response.json({ deletedRecords: expired.length, retentionDays: 30 }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[founder-data-cleanup] Could not remove expired records:', error instanceof Error ? error.message : 'Unknown storage error');
    return Response.json({ error: 'Could not clean up expired Founder Office data.' }, { status: 500 });
  }
}
