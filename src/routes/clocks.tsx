import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { useClocks, type Clock } from "@/lib/store";
import {
  TIMEZONES,
  formatDateInZone,
  formatTimeInZone,
  getHourInZone,
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

type SortMode = "alpha" | "time-asc" | "time-desc";

type ListItem =
  { kind: "single"; clock: Clock } | { kind: "group"; country: string; clocks: Clock[] };

function groupByCountry(clocks: Clock[]): ListItem[] {
  const byCountry = new Map<string, Clock[]>();
  for (const c of clocks) {
    const key = c.country?.trim() || "Other";
    const arr = byCountry.get(key);
    if (arr) arr.push(c);
    else byCountry.set(key, [c]);
  }
  const items: ListItem[] = [];
  for (const [country, group] of byCountry) {
    items.push(
      group.length > 1
        ? { kind: "group", country, clocks: group }
        : { kind: "single", clock: group[0] },
    );
  }
  return items;
}

function countryOf(item: ListItem): string {
  return item.kind === "single" ? item.clock.country : item.country;
}

function avgHour(clocksIn: Clock[], now: Date): number {
  const hours = clocksIn.map((c) => getHourInZone(c.timezone, now));
  return hours.reduce((a, b) => a + b, 0) / hours.length;
}

function sortAndOrder(items: ListItem[], mode: SortMode, now: Date): ListItem[] {
  const withinGroupSort = (clocksIn: Clock[]) =>
    [...clocksIn].sort((a, b) => {
      if (mode === "alpha") return a.city.localeCompare(b.city);
      const ha = getHourInZone(a.timezone, now);
      const hb = getHourInZone(b.timezone, now);
      if (ha !== hb) return mode === "time-asc" ? ha - hb : hb - ha;
      return a.city.localeCompare(b.city);
    });

  const ordered = items.map((item) =>
    item.kind === "group" ? { ...item, clocks: withinGroupSort(item.clocks) } : item,
  );

  ordered.sort((a, b) => {
    if (mode === "alpha") return countryOf(a).localeCompare(countryOf(b));
    const ha = a.kind === "single" ? getHourInZone(a.clock.timezone, now) : avgHour(a.clocks, now);
    const hb = b.kind === "single" ? getHourInZone(b.clock.timezone, now) : avgHour(b.clocks, now);
    if (ha !== hb) return mode === "time-asc" ? ha - hb : hb - ha;
    return countryOf(a).localeCompare(countryOf(b));
  });

  return ordered;
}

function ClocksPage() {
  const { clocks, add, remove } = useClocks();
  const [open, setOpen] = useState(false);
  const now = useNow();

  const [sortMode, setSortMode] = useLocalStorageState<SortMode>("clocks:sort-mode", "alpha");
  const [hour12, setHour12] = useLocalStorageState<boolean>("clocks:hour12", true);
  const [expanded, setExpanded] = useLocalStorageState<Record<string, boolean>>(
    "clocks:expanded-groups",
    {},
  );

  const items = useMemo(
    () => sortAndOrder(groupByCountry(clocks), sortMode, now),
    [clocks, sortMode, now],
  );

  return (
    <div>
      <PageHeader
        title="World Clocks"
        subtitle={`Live times across regions · ${new Set(clocks.map((c) => c.timezone)).size} of ${TIMEZONES.length} timezones added`}
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
                existing={clocks}
                onPick={async (tz) => {
                  try {
                    await add({ timezone: tz.timezone, city: tz.city, country: tz.country });
                    setOpen(false);
                  } catch (err) {
                    if (err instanceof Error && err.message === "ALREADY_ADDED") {
                      toast.error(`${tz.city} has already been added.`);
                    } else {
                      toast.error("Couldn't add that clock. Try again.");
                    }
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {clocks.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-9 w-[190px] bg-background text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alpha">Sort: A–Z</SelectItem>
              <SelectItem value="time-asc">Sort: Morning → Night</SelectItem>
              <SelectItem value="time-desc">Sort: Night → Morning</SelectItem>
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            variant="outline"
            value={hour12 ? "12h" : "24h"}
            onValueChange={(v) => v && setHour12(v === "12h")}
          >
            <ToggleGroupItem value="12h" className="h-9 px-3 text-xs data-[state=on]:bg-accent">
              12h
            </ToggleGroupItem>
            <ToggleGroupItem value="24h" className="h-9 px-3 text-xs data-[state=on]:bg-accent">
              24h
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {clocks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No clocks yet. Add your first one.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) =>
            item.kind === "single" ? (
              <ClockRow
                key={item.clock.id}
                clock={item.clock}
                now={now}
                hour12={hour12}
                onRemove={() => remove(item.clock.id)}
              />
            ) : (
              <CountryGroupRow
                key={item.country}
                country={item.country}
                clocks={item.clocks}
                now={now}
                hour12={hour12}
                expanded={!!expanded[item.country]}
                onToggle={() => setExpanded((e) => ({ ...e, [item.country]: !e[item.country] }))}
                onRemove={(id) => remove(id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ClockRow({
  clock,
  now,
  hour12,
  onRemove,
  compact = false,
}: {
  clock: Clock;
  now: Date;
  hour12: boolean;
  onRemove: () => void;
  compact?: boolean;
}) {
  const time = formatTimeInZone(clock.timezone, now, { hour12, seconds: true });
  const date = formatDateInZone(clock.timezone, now);
  const offset = getOffsetLabel(clock.timezone, now);

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3",
        compact && "border-border/60 bg-background/40",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{clock.city}</div>
        <div className="text-xs text-muted-foreground truncate">{clock.country}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <div className="font-mono text-xl sm:text-2xl tabular-nums tracking-tight">{time}</div>
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>{date}</span>
            <span>·</span>
            <span>{offset}</span>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
          aria-label={`Remove ${clock.city}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CountryGroupRow({
  country,
  clocks,
  now,
  hour12,
  expanded,
  onToggle,
  onRemove,
}: {
  country: string;
  clocks: Clock[];
  now: Date;
  hour12: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const byHour = [...clocks].sort(
    (a, b) => getHourInZone(a.timezone, now) - getHourInZone(b.timezone, now),
  );
  const earliest = byHour[0];
  const latest = byHour[byHour.length - 1];
  const rangeLabel =
    earliest.timezone === latest.timezone
      ? formatTimeInZone(earliest.timezone, now, { hour12, seconds: false })
      : `${formatTimeInZone(earliest.timezone, now, { hour12, seconds: false })} – ${formatTimeInZone(
          latest.timezone,
          now,
          { hour12, seconds: false },
        )}`;

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-accent/40">
            <div className="flex min-w-0 items-center gap-2.5">
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  expanded && "rotate-180",
                )}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{country}</div>
                <div className="text-xs text-muted-foreground">{clocks.length} timezones</div>
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
              {rangeLabel}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t border-border bg-background/30 p-2">
            {clocks.map((c) => (
              <ClockRow
                key={c.id}
                clock={c}
                now={now}
                hour12={hour12}
                onRemove={() => onRemove(c.id)}
                compact
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function TimezonePicker({
  existing,
  onPick,
}: {
  existing: Clock[];
  onPick: (tz: (typeof TIMEZONES)[number]) => void;
}) {
  const [q, setQ] = useState("");
  const now = new Date();
  const addedTimezones = useMemo(
    () => new Set(existing.map((c) => c.timezone)),
    [existing],
  );

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
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search city, region, or country…"
            className="pl-9 bg-background"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
          {addedTimezones.size} of {TIMEZONES.length} added
        </span>
      </div>
      <ul className="mt-3 max-h-80 overflow-auto divide-y divide-border rounded-md border border-border">
        {results.map((tz) => {
          const added = addedTimezones.has(tz.timezone);
          return (
            <li key={tz.timezone}>
              <button
                onClick={() => {
                  if (added) {
                    toast.error(`${tz.city} has already been added.`);
                    return;
                  }
                  onPick(tz);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition",
                  added ? "opacity-50 cursor-default" : "hover:bg-accent/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm truncate">
                    {tz.city}
                    {tz.region && <span className="text-muted-foreground"> · {tz.region}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {tz.country} — {tz.timezone}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {getOffsetLabel(tz.timezone, now)}
                  </span>
                  {added && <Check className="h-4 w-4 text-primary" />}
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground text-center">No matches.</li>
        )}
      </ul>
    </div>
  );
}
