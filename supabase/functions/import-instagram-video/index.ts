import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VIDEO_BUCKET = "motivational-videos";
const THUMB_BUCKET = "motivational-thumbnails";
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

/** Instagram's og:title is HTML-entity-encoded — decode named entities plus
 *  numeric/hex ones (e.g. &#x2019; for a curly apostrophe), which show up a
 *  lot in real captions. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

/** og:title is the whole caption (often several sentences + hashtags),
 *  wrapped as `Account on Instagram: "caption..."`. Turn that into a short,
 *  usable default title — the user can still edit it before saving. */
function shortTitleFromCaption(raw: string): string {
  const unwrapped = raw.replace(/^.*? on Instagram:\s*"?/, "").replace(/"$/, "");
  const firstLine = unwrapped.split("\n")[0].trim();
  const noHashtags = firstLine.replace(/#\S+/g, "").trim();
  const base = noHashtags || firstLine || raw;
  return base.length > 80 ? base.slice(0, 77).trimEnd() + "…" : base;
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

interface OgImage {
  url: string;
  width?: number;
  height?: number;
}

/** Instagram publishes its own thumbnail + real pixel dimensions via
 *  og:image / og:image:width / og:image:height — far more reliable than
 *  generating one ourselves from the video, and gives us the exact
 *  aspect ratio (e.g. 0.5625 for a 9:16 reel) up front. */
function extractOgImage(html: string): OgImage | null {
  const urlMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!urlMatch) return null;
  const widthMatch = html.match(/<meta property="og:image:width" content="(\d+)"/);
  const heightMatch = html.match(/<meta property="og:image:height" content="(\d+)"/);
  return {
    url: decodeHtmlEntities(urlMatch[1]),
    width: widthMatch ? Number(widthMatch[1]) : undefined,
    height: heightMatch ? Number(heightMatch[1]) : undefined,
  };
}

interface ExtractResult {
  videoUrl: string;
  caption?: string;
  image: OgImage | null;
  debug: string;
}

/**
 * Tries several public extraction paths against Instagram's public page
 * HTML for a post/reel:
 *  1. og:video meta tag — served to link-preview crawlers on some posts.
 *  2. "video_url":"..." plain JSON field — present on some post types.
 *  3. Generic search for any quoted .mp4 CDN URL embedded anywhere in the
 *     page's bundled JSON, regardless of key name — this is what modern
 *     Reels pages actually contain, with slashes JSON-escaped (\/) and
 *     query-string ampersands HTML-entity-encoded (&amp;).
 * Also pulls og:image (+ dimensions) from whichever page variant has it,
 * for the thumbnail.
 */
async function fetchVideoUrl(postUrl: string): Promise<ExtractResult> {
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
  const caption = titleMatch ? shortTitleFromCaption(decodeHtmlEntities(titleMatch[1])) : undefined;
  let image = extractOgImage(html);

  const ogMatch =
    html.match(/<meta property="og:video:secure_url" content="([^"]+)"/) ??
    html.match(/<meta property="og:video" content="([^"]+)"/);
  if (ogMatch) {
    return { videoUrl: ogMatch[1].replace(/&amp;/g, "&"), caption, image, debug: "og:video" };
  }

  const jsonMatch = html.match(/"video_url":"([^"]+)"/);
  if (jsonMatch) {
    const decoded = jsonMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    return { videoUrl: decoded, caption, image, debug: "video_url json" };
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
  if (!image) image = extractOgImage(html2);
  const ogMatch2 =
    html2.match(/<meta property="og:video:secure_url" content="([^"]+)"/) ??
    html2.match(/<meta property="og:video" content="([^"]+)"/);
  if (ogMatch2) {
    return { videoUrl: ogMatch2[1].replace(/&amp;/g, "&"), caption, image, debug: "og:video (attempt 2)" };
  }
  const jsonMatch2 = html2.match(/"video_url":"([^"]+)"/);
  if (jsonMatch2) {
    const decoded = jsonMatch2[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    return { videoUrl: decoded, caption, image, debug: "video_url json (attempt 2)" };
  }

  // Generic fallback: grab any quoted string containing a CDN .mp4 URL,
  // regardless of which JSON key it's under. Decode the \/ (JSON escape)
  // and &amp; (HTML entity) encodings Instagram wraps the URL in.
  const mp4Match =
    html2.match(/"(https:\\\/\\\/[^"]*?\.mp4[^"]*?)"/) ??
    html.match(/"(https:\\\/\\\/[^"]*?\.mp4[^"]*?)"/);
  if (mp4Match) {
    const decoded = mp4Match[1]
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0026/g, "&");
    return { videoUrl: decoded, caption, image, debug: "mp4 regex" };
  }

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

    const { videoUrl, caption, image, debug } = await fetchVideoUrl(igUrl.toString());
    console.log("extracted via", debug, "has image:", !!image);

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

    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(path, bytes, { contentType: "video/mp4" });
    if (uploadError) return json({ error: uploadError.message }, 500);

    // Best-effort thumbnail — a failure here shouldn't fail the whole import.
    let thumbnailPath: string | null = null;
    let aspectRatio: number | null = null;
    if (image) {
      try {
        const imgRes = await fetch(image.url);
        if (imgRes.ok) {
          const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
          const thumbPath = `${user.id}/${id}.jpg`;
          const { error: thumbErr } = await supabase.storage
            .from(THUMB_BUCKET)
            .upload(thumbPath, imgBytes, { contentType: "image/jpeg" });
          if (!thumbErr) {
            thumbnailPath = thumbPath;
            if (image.width && image.height) aspectRatio = image.width / image.height;
          }
        }
      } catch (e) {
        console.error("thumbnail download/upload failed", e);
      }
    }

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
        thumbnail_path: thumbnailPath,
        aspect_ratio: aspectRatio,
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
