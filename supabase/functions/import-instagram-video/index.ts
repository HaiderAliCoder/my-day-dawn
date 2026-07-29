import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VIDEO_BUCKET = "motivational-videos";
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidInstagramUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!/(^|\.)instagram\.com$/.test(url.hostname)) return null;
    if (!/^\/(reel|p|tv)\/[^/]+\/?$/.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Tries several public extraction paths, in order of how "intended for
 * public consumption" they are:
 *  1. og:video meta tag — what Instagram sends to link-preview crawlers
 *     (Facebook, Slack, iMessage, etc). Works for some posts.
 *  2. video_url field embedded in the page's own JSON payload — the
 *     same data the web client itself reads to play the video, present
 *     in the server-rendered HTML for public posts.
 */
async function fetchVideoUrl(postUrl: string): Promise<{ videoUrl: string; caption?: string; debug: string }> {
  const res = await fetch(postUrl, {
    headers: {
      "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      Accept: "text/html",
    },
  });
  if (!res.ok) {
    throw new Error(`Instagram returned ${res.status} — the post may be private, removed, or age-restricted.`);
  }
  const html = await res.text();
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const caption = titleMatch?.[1];

  const ogMatch =
    html.match(/<meta property="og:video:secure_url" content="([^"]+)"/) ??
    html.match(/<meta property="og:video" content="([^"]+)"/);
  if (ogMatch) {
    return { videoUrl: ogMatch[1].replace(/&amp;/g, "&"), caption, debug: "og:video" };
  }

  const jsonMatch = html.match(/"video_url":"([^"]+)"/);
  if (jsonMatch) {
    const decoded = jsonMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    return { videoUrl: decoded, caption, debug: "video_url json" };
  }

  // Second attempt: fetch again with the app-id header Instagram's own
  // web client sends, which sometimes changes what HTML variant is served.
  const res2 = await fetch(postUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
      "X-IG-App-ID": "936619743392459",
      Accept: "text/html",
    },
  });
  const html2 = await res2.text();
  const ogMatch2 =
    html2.match(/<meta property="og:video:secure_url" content="([^"]+)"/) ??
    html2.match(/<meta property="og:video" content="([^"]+)"/);
  if (ogMatch2) {
    return { videoUrl: ogMatch2[1].replace(/&amp;/g, "&"), caption, debug: "og:video (attempt 2)" };
  }
  const jsonMatch2 = html2.match(/"video_url":"([^"]+)"/);
  if (jsonMatch2) {
    const decoded = jsonMatch2[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    return { videoUrl: decoded, caption, debug: "video_url json (attempt 2)" };
  }

  console.log("extraction failed. html1 length", html.length, "html2 length", html2.length);
  console.log("html1 sample", html.slice(0, 500));
  throw new Error(
    "Couldn't find a video on that link. Instagram may be blocking automated access to this post right now — make sure it's public, or try downloading it manually and uploading the file instead.",
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server misconfiguration (missing Supabase env vars)." }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) return json({ error: "Not signed in" }, 401);

    let body: { url?: string; title?: string; tags?: string[] };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }
    const { url, title, tags } = body;

    const igUrl = isValidInstagramUrl(url ?? "");
    if (!igUrl) {
      return json(
        { error: "That doesn't look like an Instagram post/reel link (instagram.com/reel/...)." },
        400,
      );
    }

    const { videoUrl, caption, debug } = await fetchVideoUrl(igUrl.toString());
    console.log("extracted via", debug);

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok || !videoRes.body) {
      return json({ error: "Couldn't download the video file from Instagram." }, 502);
    }
    const contentLength = Number(videoRes.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > MAX_VIDEO_BYTES) {
      return json(
        { error: "That clip is over 10MB, which is the limit for the motivational library." },
        413,
      );
    }

    const bytes = new Uint8Array(await videoRes.arrayBuffer());
    if (bytes.byteLength > MAX_VIDEO_BYTES) {
      return json(
        { error: "That clip is over 10MB, which is the limit for the motivational library." },
        413,
      );
    }

    const path = `${user.id}/${crypto.randomUUID()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(path, bytes, { contentType: "video/mp4" });
    if (uploadError) return json({ error: uploadError.message }, 500);

    const finalTitle = (title && String(title).trim()) || caption || "Instagram clip";
    const finalTags = Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [];

    const { data: row, error: insertError } = await supabase
      .from("motivational_videos")
      .insert({
        user_id: user.id,
        title: finalTitle,
        storage_path: path,
        tags: finalTags,
        source_url: igUrl.toString(),
      })
      .select("*")
      .single();
    if (insertError) return json({ error: insertError.message }, 500);

    return json({ video: row });
  } catch (err) {
    console.error("unhandled error", err instanceof Error ? err.stack ?? err.message : err);
    return json({ error: err instanceof Error ? err.message : "Import failed" }, 500);
  }
});
