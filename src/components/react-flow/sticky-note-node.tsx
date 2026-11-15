"use client";

import { memo, useEffect, useRef, useState } from "react";
import { NodeResizer, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  STICKY_COLORS,
  STICKY_MIN_SIZE,
  stickyColor,
  stickySize,
  type StickyNoteData,
} from "@/features/editor/lib/sticky-notes";

type StickyNode = Node<StickyNoteData>;

/**
 * A note on the canvas, like n8n's sticky notes: double-click to write,
 * drag a corner to resize, pick a colour when selected. It has no ports and
 * never runs; the engine leaves it out.
 */
export const StickyNoteNode = memo(({ id, data, selected }: NodeProps<StickyNode>) => {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text ?? "");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const color = stickyColor(data.color);
  const { width, height } = stickySize(data);

  useEffect(() => {
    if (!editing) setDraft(data.text ?? "");
  }, [data.text, editing]);

  useEffect(() => {
    if (editing) textarea.current?.focus();
  }, [editing]);

  const update = (patch: Partial<StickyNoteData>) =>
    setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node))
    );

  const finish = () => {
    setEditing(false);
    if (draft !== (data.text ?? "")) update({ text: draft });
  };

  return (
    <div
      className={cn("relative rounded-md border shadow-sm", color.className)}
      style={{ width, height }}
      onDoubleClick={() => setEditing(true)}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={STICKY_MIN_SIZE.width}
        minHeight={STICKY_MIN_SIZE.height}
        onResizeEnd={(_, params) => update({ width: Math.round(params.width), height: Math.round(params.height) })}
      />
      {editing ? (
        <textarea
          ref={textarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            // Escape leaves the note; the canvas shortcuts stay off while typing
            if (event.key === "Escape") finish();
            event.stopPropagation();
          }}
          className="nodrag nowheel h-full w-full resize-none bg-transparent p-3 text-sm outline-none"
          placeholder="Write a note..."
          maxLength={5000}
        />
      ) : (
        <div className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-3 text-sm">
          {data.text?.trim() ? data.text : <span className="opacity-60">Double-click to write a note</span>}
        </div>
      )}
      {selected && !editing && (
        <div className="nodrag absolute -top-8 left-0 flex gap-1 rounded-md border bg-background p-1 shadow-sm">
          {STICKY_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={`${option.label} note`}
              title={option.label}
              onClick={() => update({ color: option.value })}
              className={cn(
                "size-4 rounded-full border",
                option.swatch,
                option.value === color.value && "ring-2 ring-primary ring-offset-1"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
});

StickyNoteNode.displayName = "StickyNoteNode";
