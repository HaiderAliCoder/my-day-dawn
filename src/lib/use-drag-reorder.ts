import { useState, type DragEvent, type HTMLAttributes } from "react";

/**
 * Minimal HTML5 drag-and-drop reorder helper.
 * Attach the returned props to each list row; drop reorders via `onReorder`.
 */
export function useDragReorder<T extends { id: string }>(
  items: T[],
  onReorder: (idsInNewOrder: string[]) => void,
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const getRowProps = (id: string): HTMLAttributes<HTMLElement> & {
    "data-dragging"?: string;
    "data-over"?: string;
  } => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", id);
      } catch {
        /* ignore */
      }
    },
    onDragOver: (e: DragEvent) => {
      if (!dragId || dragId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overId !== id) setOverId(id);
    },
    onDragLeave: () => {
      if (overId === id) setOverId(null);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const source = dragId;
      setDragId(null);
      setOverId(null);
      if (!source || source === id) return;
      const ids = items.map((i) => i.id);
      const from = ids.indexOf(source);
      const to = ids.indexOf(id);
      if (from < 0 || to < 0) return;
      const next = ids.slice();
      next.splice(from, 1);
      next.splice(to, 0, source);
      onReorder(next);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
    "data-dragging": dragId === id ? "true" : undefined,
    "data-over": overId === id && dragId !== id ? "true" : undefined,
  });

  return { getRowProps, dragId, overId };
}
