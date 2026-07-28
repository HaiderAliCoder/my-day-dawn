import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
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
import { useClocks } from "@/lib/store";
import {
  TIMEZONES,
  formatDateInZone,
  formatTimeInZone,
  getOffsetLabel,
} from "@/lib/timezones";

export const Route = createFileRoute("/clocks")({
  head: () => ({
    meta: [
      { title: "World Clocks — Focus" },
      { name: "description", content: "Live world clocks with IANA timezone accuracy." },
      { property: "og:title", content: "World Clocks — Focus" },
      { property: "og:description", content: "Live world clocks with IANA timezone accuracy." },
    ],
  }),
  component: ClocksPage,
});

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function ClocksPage() {
  const { clocks, add, remove } = useClocks();
  const [open, setOpen] = useState(false);
  const now = useNow();

  return (
    <div>
      <PageHeader
        title="World Clocks"
        subtitle="Live times across regions"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Add clock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add a clock</DialogTitle>
              </DialogHeader>
              <TimezonePicker
                onPick={(tz) => {
                  add({ timezone: tz.timezone, city: tz.city, country: tz.country });
                  setOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {clocks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No clocks yet. Add your first one.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clocks.map((c) => {
            const time = formatTimeInZone(c.timezone, now);
            const date = formatDateInZone(c.timezone, now);
            const offset = getOffsetLabel(c.timezone, now);
            return (
              <div
                key={c.id}
                className="group rounded-xl border border-border bg-card p-5 relative"
              >
                <button
                  onClick={() => remove(c.id)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="text-sm font-medium truncate">{c.city}</div>
                <div className="text-xs text-muted-foreground truncate">{c.country}</div>
                <div className="mt-3 font-mono text-3xl tabular-nums tracking-tight">
                  {time}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{date}</span>
                  <span>{offset}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimezonePicker({ onPick }: { onPick: (tz: typeof TIMEZONES[number]) => void }) {
  const [q, setQ] = useState("");
  const now = new Date();
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? TIMEZONES.filter((tz) =>
          [tz.city, tz.country, tz.region, tz.timezone]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(query)),
        )
      : TIMEZONES;
    return list.slice(0, 60);
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search city, region, or country…"
          className="pl-9 bg-background"
        />
      </div>
      <ul className="mt-3 max-h-80 overflow-auto divide-y divide-border rounded-md border border-border">
        {results.map((tz) => (
          <li key={tz.timezone}>
            <button
              onClick={() => onPick(tz)}
              className="w-full text-left px-3 py-2 hover:bg-accent/60 flex items-center justify-between gap-3"
            >
              <span className="min-w-0">
                <span className="block text-sm truncate">
                  {tz.city}
                  {tz.region && (
                    <span className="text-muted-foreground"> · {tz.region}</span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  {tz.country} — {tz.timezone}
                </span>
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {getOffsetLabel(tz.timezone, now)}
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground text-center">No matches.</li>
        )}
      </ul>
    </div>
  );
}
