"use client";

import { type ReactNode } from "react";
import {
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";

import { BaseNode } from "./base-node";

export type PlaceholderNodeProps = Partial<NodeProps> & {
  children?: ReactNode;
  onClick?: () => void
};

export function PlaceholderNode({ children, onClick }: PlaceholderNodeProps) {

  return (
    <BaseNode
      className="cursor-pointer bg-card w-auto border-dashed h-auto border-gray-400 p-2 hover:border-gray-500 hover:bg-gray-500 text-center text-gray-400 shadow-none"
      onClick={onClick}
    >
      {children}
      <Handle
        type="target"
        style={{ visibility: "hidden" }}
        position={Position.Top}
        isConnectable={false}
      />
      <Handle
        type="source"
        style={{ visibility: "hidden" }}
        position={Position.Bottom}
        isConnectable={false}
      />
    </BaseNode>
  );
}
