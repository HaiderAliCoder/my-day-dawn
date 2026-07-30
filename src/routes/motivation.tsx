import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Image as ImageIcon,
  Link as LinkIcon,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  useMotivationalImages,
  useMotivationalVideos,
  type MotivationalImage,
  type MotivationalVideo,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/motivation")({
  head: () => ({
    meta: [
      { title: "Motivation — Focus" },
      { name: "description", content: "Your own library of motivational clips and pictures." },
      { property: "og:title", content: "Motivation — Focus" },
      {
        property: "og:description",
        content: "Your own library of motivational clips and pictures.",
      },
    ],
  }),
  component: MotivationPage,
});

type Tab = "videos" | "pictures";

function MotivationPage() {
  const [tab, setTab] = useState<Tab>("videos");
  const [open, setOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Motivation"
        subtitle="Your own clips and pictures — for when starting is the hard part"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                Add {tab === "videos" ? "video" : "picture"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  Add a motivational {tab === "videos" ? "clip" : "picture"}
                </DialogTitle>
              </DialogHeader>
              {tab === "videos" ? (
                <VideoUploadForm onDone={() => setOpen(false)} />
              ) : (
                <ImageUploadForm onDone={() => setOpen(false)} />
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-6 inline-flex rounded-lg border border-border bg-card p-1">
        <button
          onClick={() => setTab("videos")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            tab === "videos"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Clapperboard className="h-3.5 w-3.5" />
          Videos
        </button>
        <button
          onClick={() => setTab("pictures")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            tab === "pictures"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Pictures
        </button>
      </div>

      {tab === "videos" ? <VideoGrid /> : <ImageGrid />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

function VideoGrid() {
  const { videos, isLoading, remove, update, getPlaybackUrl, pickRandom } =
    useMotivationalVideos();
  const [player, setPlayer] = useState<{ title: string; url: string } | null>(null);
  const [editing, setEditing] = useState<MotivationalVideo | null>(null);

  const openPlayer = async (video: MotivationalVideo) => {
    const url = await getPlaybackUrl(video.storagePath);
    if (url) setPlayer({ title: video.title, url });
  };

  const surpriseMe = async () => {
    const pick = pickRandom();
    if (pick) await openPlayer(pick);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>;

  if (videos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No clips yet. Add a short video (max 10MB) — a pep talk, a reminder of why you started,
          whatever gets you moving.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <Button variant="outline" size="sm" onClick={surpriseMe}>
          <Shuffle className="h-3.5 w-3.5 mr-1.5" />
          Surprise me
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <div key={v.id} className="group rounded-xl border border-border bg-card p-4 relative">
            <div className="absolute top-3 right-3 flex items-center gap-1">
              <button
                onClick={() => setEditing(v)}
                className="text-muted-foreground hover:text-foreground transition p-1"
                aria-label="Edit title and tags"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(v)}
                className="text-destructive hover:text-destructive/80 transition p-1"
                aria-label="Delete video"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => openPlayer(v)}
              className="w-full flex flex-col items-start gap-3 text-left"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Play className="h-4 w-4 ml-0.5" />
              </span>
              <span>
                <span className="block text-sm font-medium truncate max-w-[14rem] pr-10">
                  {v.title}
                </span>
                {v.tags.length > 0 && (
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate max-w-[14rem]">
                    {v.tags.join(" · ")}
                  </span>
                )}
              </span>
            </button>
          </div>
        ))}
      </div>

      {player && (
        <Lightbox onClose={() => setPlayer(null)} title={player.title}>
          <video src={player.url} controls autoPlay className="w-full rounded-md max-h-[70vh]" />
        </Lightbox>
      )}

      {editing && (
        <EditVideoDialog
          video={editing}
          onSave={async (title, tags) => {
            await update(editing.id, title, tags);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** Shared title+tags edit form — used both for editing an existing clip
 *  and as the "confirm before saving" step right after an Instagram import. */
function EditVideoDialog({
  video,
  onSave,
  onCancel,
  onDiscard,
  saveLabel = "Save",
}: {
  video: { title: string; tags: string[] };
  onSave: (title: string, tags: string[]) => Promise<void>;
  onCancel: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
}) {
  const [title, setTitle] = useState(video.title);
  const [tags, setTags] = useState(video.tags.join(", "));
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await onSave(title.trim(), tagList);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-card border border-border p-5 space-y-4"
      >
        <h3 className="text-sm font-medium">Edit clip</h3>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="bg-background"
          autoFocus
        />
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags, comma separated — e.g. discipline, faith"
          className="bg-background"
        />
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={!title.trim() || saving} className="flex-1">
            {saving ? "Saving…" : saveLabel}
          </Button>
          {onDiscard && (
            <Button type="button" variant="outline" onClick={onDiscard} className="text-destructive">
              Discard
            </Button>
          )}
          {!onDiscard && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function VideoUploadForm({ onDone }: { onDone: () => void }) {
  const { upload, uploading, uploadError, importFromInstagram, importing, importError, remove, update } =
    useMotivationalVideos();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [igUrl, setIgUrl] = useState("");
  const [igError, setIgError] = useState<string | null>(null);
  const [imported, setImported] = useState<MotivationalVideo | null>(null);

  const onFileChange = (f: File | null) => {
    setSizeError(null);
    if (f && f.size > MAX_VIDEO_BYTES) {
      setSizeError("That file is over 10MB — trim it down or pick a shorter clip.");
      setFile(null);
      return;
    }
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await upload(file, title.trim(), tagList);
    onDone();
  };

  const submitInstagram = async (e: React.FormEvent) => {
    e.preventDefault();
    setIgError(null);
    const trimmed = igUrl.trim();
    if (!trimmed) return;
    if (!/^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[^/?#\s]+/i.test(trimmed)) {
      setIgError(
        "That's not a full post/reel link. It should look like instagram.com/reel/ABC123 — open the post in Instagram, tap Share → Copy Link, and paste that.",
      );
      return;
    }
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      // Import downloads the clip into your library right away (that part
      // can't be undone without a delete), but we don't treat it as
      // "finished" yet — the review step below is the actual confirm point:
      // fix the auto-filled title/tags, or discard it entirely.
      const video = await importFromInstagram(trimmed, title.trim() || undefined, tagList);
      setImported(video);
    } catch (err) {
      setIgError(err instanceof Error ? err.message : "Import failed.");
    }
  };

  if (imported) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Imported. Review the title and tags below, then save — or discard it if it's not the
          right clip.
        </p>
        <EditVideoDialog
          video={imported}
          saveLabel="Save to library"
          onSave={async (t, tg) => {
            await update(imported.id, t, tg);
            onDone();
          }}
          onCancel={onDone}
          onDiscard={async () => {
            await remove(imported);
            onDone();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        <div
          onClick={() => inputRef.current?.click()}
          className={cn(
            "rounded-lg border border-dashed border-border p-6 text-center cursor-pointer hover:bg-accent/30 transition",
            file && "border-primary/60",
          )}
        >
          <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">{file ? file.name : "Click to choose a video (max 10MB)"}</p>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </div>
        {sizeError && <p className="text-xs text-destructive">{sizeError}</p>}

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-2 text-xs text-muted-foreground">or paste a link</span>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={igUrl}
              onChange={(e) => setIgUrl(e.target.value)}
              placeholder="instagram.com/reel/…"
              className="pl-9 bg-background"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!igUrl.trim() || importing}
            onClick={submitInstagram}
          >
            {importing ? "Importing…" : "Import"}
          </Button>
        </div>
        {igError && <p className="text-xs text-destructive">{igError}</p>}
        {importError && !igError && (
          <p className="text-xs text-destructive">{importError.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Public reels/posts only — this pulls the clip straight into your library so you don't
          need a separate download step.
        </p>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="bg-background"
        />
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags, comma separated (optional) — e.g. discipline, faith"
          className="bg-background"
        />

        {uploadError && <p className="text-xs text-destructive">{uploadError.message}</p>}

        <Button type="submit" disabled={!file || !title.trim() || uploading} className="w-full">
          {uploading ? "Uploading…" : "Add clip from file"}
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

function ImageGrid() {
  const { images, isLoading, remove, getViewUrl } = useMotivationalImages();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const img of images) {
        if (thumbs[img.id]) continue;
        const url = await getViewUrl(img.storagePath);
        if (!cancelled && url) {
          setThumbs((prev) => ({ ...prev, [img.id]: url }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const openViewer = async (image: MotivationalImage) => {
    const url = thumbs[image.id] ?? (await getViewUrl(image.storagePath));
    if (url) setViewer({ title: image.title, url });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>;

  if (images.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No pictures yet. Add a photo (max 3MB) — a goal board, a quote, a memory of why this
          matters.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img) => (
          <div
            key={img.id}
            className="group relative aspect-square rounded-xl border border-border bg-card overflow-hidden"
          >
            <button
              onClick={() => remove(img)}
              className="absolute top-2 right-2 z-10 p-1 rounded-md bg-background/80 text-destructive hover:text-destructive/80 transition"
              aria-label="Delete picture"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => openViewer(img)} className="w-full h-full block">
              {thumbs[img.id] ? (
                <img src={thumbs[img.id]} alt={img.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-left">
                <span className="block text-xs text-white truncate">{img.title}</span>
              </span>
            </button>
          </div>
        ))}
      </div>

      {viewer && (
        <Lightbox onClose={() => setViewer(null)} title={viewer.title}>
          <img
            src={viewer.url}
            alt={viewer.title}
            className="w-full rounded-md max-h-[75vh] object-contain"
          />
        </Lightbox>
      )}
    </>
  );
}

function ImageUploadForm({ onDone }: { onDone: () => void }) {
  const { upload, uploading, uploadError } = useMotivationalImages();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (f: File | null) => {
    setSizeError(null);
    if (f && f.size > MAX_IMAGE_BYTES) {
      setSizeError("That file is over 3MB — pick a smaller image.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
    if (f && !title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await upload(file, title.trim(), tagList);
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        className={cn(
          "rounded-lg border border-dashed border-border p-6 text-center cursor-pointer hover:bg-accent/30 transition overflow-hidden",
          file && "border-primary/60",
        )}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="mx-auto max-h-40 rounded-md mb-2 object-contain"
          />
        ) : (
          <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        )}
        <p className="text-sm">{file ? file.name : "Click to choose a picture (max 3MB)"}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>
      {sizeError && <p className="text-xs text-destructive">{sizeError}</p>}

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="bg-background"
        required
      />
      <Input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags, comma separated (optional) — e.g. goals, quotes"
        className="bg-background"
      />

      {uploadError && <p className="text-xs text-destructive">{uploadError.message}</p>}

      <Button type="submit" disabled={!file || !title.trim() || uploading} className="w-full">
        {uploading ? "Uploading…" : "Add picture"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared lightbox
// ---------------------------------------------------------------------------

function Lightbox({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-card border border-border p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium truncate">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
