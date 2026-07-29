import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Play, Plus, Shuffle, Trash2, Upload, X } from "lucide-react";
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
import { MAX_VIDEO_BYTES, useMotivationalVideos, type MotivationalVideo } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/motivation")({
  head: () => ({
    meta: [
      { title: "Motivation — Focus" },
      { name: "description", content: "Your own library of short motivational clips." },
      { property: "og:title", content: "Motivation — Focus" },
      { property: "og:description", content: "Your own library of short motivational clips." },
    ],
  }),
  component: MotivationPage,
});

function MotivationPage() {
  const { videos, isLoading, remove, getPlaybackUrl, pickRandom } = useMotivationalVideos();
  const [open, setOpen] = useState(false);
  const [player, setPlayer] = useState<{ title: string; url: string } | null>(null);

  const openPlayer = async (video: MotivationalVideo) => {
    const url = await getPlaybackUrl(video.storagePath);
    if (url) setPlayer({ title: video.title, url });
  };

  const surpriseMe = async () => {
    const pick = pickRandom();
    if (pick) await openPlayer(pick);
  };

  return (
    <div>
      <PageHeader
        title="Motivation"
        subtitle="Your own clips — for when starting is the hard part"
        actions={
          <div className="flex items-center gap-2">
            {videos.length > 0 && (
              <Button variant="outline" onClick={surpriseMe}>
                <Shuffle className="h-4 w-4 mr-1.5" />
                Surprise me
              </Button>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add video
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add a motivational clip</DialogTitle>
                </DialogHeader>
                <UploadForm onDone={() => setOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No clips yet. Add a short video (max 10MB) — a pep talk, a reminder of why you started,
            whatever gets you moving.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <div key={v.id} className="group rounded-xl border border-border bg-card p-4 relative">
              <button
                onClick={() => remove(v)}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                aria-label="Delete video"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => openPlayer(v)}
                className="w-full flex flex-col items-start gap-3 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Play className="h-4 w-4 ml-0.5" />
                </span>
                <span>
                  <span className="block text-sm font-medium truncate max-w-[14rem]">
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
      )}

      {player && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPlayer(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-card border border-border p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium truncate">{player.title}</h3>
              <button
                onClick={() => setPlayer(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <video src={player.url} controls autoPlay className="w-full rounded-md max-h-[70vh]" />
          </div>
        </div>
      )}
    </div>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const { upload, uploading, uploadError } = useMotivationalVideos();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
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
        placeholder="Tags, comma separated (optional) — e.g. discipline, faith"
        className="bg-background"
      />

      {uploadError && <p className="text-xs text-destructive">{uploadError.message}</p>}

      <Button type="submit" disabled={!file || !title.trim() || uploading} className="w-full">
        {uploading ? "Uploading…" : "Add clip"}
      </Button>
    </form>
  );
}
