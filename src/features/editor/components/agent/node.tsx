"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, useReactFlow, Node, useEdges } from "@xyflow/react";
import { Bot, Trash2 } from "lucide-react";

const PORT_COLOR = "#7B81BC";

export const AIAgentNode = memo(({ id, selected }: NodeProps<Node>) => {
  const { setNodes, setEdges } = useReactFlow();
  const edges = useEdges();

  // 🚀 n8n Style: Compute tool attachments dynamically from canvas edges
  const toolCount = edges.filter(
    (edge) => edge.target === id && edge.targetHandle === "sub-tools"
  ).length;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nodes) => nodes.filter((node) => node.id !== id));
    setEdges((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id));
  };

  return (
    <div className="relative selection:bg-transparent group">
      
      {/* Delete Button */}
      <button
        onClick={handleDelete}
        className={`absolute -top-3 -right-3 z-10 p-1.5 bg-red-50 text-red-500 border border-red-200 rounded-full shadow-sm hover:bg-red-100 transition-all duration-200 ${
          selected ? "opacity-100 scale-100" : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
        }`}
        title="Delete Node"
      >
        <Trash2 className="w-4 h-4" strokeWidth={2} />
      </button>

      {/* Main Node Body */}
      <div 
        className={`w-[260px] h-[100px] bg-white rounded-xl shadow-sm transition-colors flex items-center pl-[42px] pr-6 gap-[18px] ${
          selected ? "border-2 border-blue-500" : "border border-slate-300 hover:border-slate-400"
        }`}
      >
        <Bot className="w-9 h-9 text-slate-800 flex-shrink-0" strokeWidth={1.6} />
        <div className="flex flex-col min-w-0 text-left leading-tight">
          <span className="font-semibold text-slate-700 text-[16px] truncate">
            AI Agent
          </span>
          <span className="text-[13px] text-slate-400 truncate">
            Tools Agent
          </span>
        </div>
      </div>

      {/* Main sequential execution handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="flow-in"
        className="!w-2 !h-4 !rounded-[2px] !bg-slate-400 !border-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="flow-out"
        className="!w-3 !h-3 !rounded-full !bg-slate-400 !border-2 !border-white"
      />

      {/* Sub-connection input ports */}
      <Handle
        type="target"
        position={Position.Bottom}
        id="sub-model"
        className="!left-[20%] !w-2.5 !h-2.5 !rounded-none !rotate-45 !border !border-white"
        style={{ background: PORT_COLOR }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="sub-memory"
        className="!left-[60%] !w-2.5 !h-2.5 !rounded-none !rotate-45 !border !border-white"
        style={{ background: PORT_COLOR }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="sub-tools"
        className="!left-[80%] !w-2.5 !h-2.5 !rounded-none !rotate-45 !border !border-white"
        style={{ background: PORT_COLOR }}
      />

      {/* Labels */}
      <span
        className="absolute left-[20%] top-full -translate-x-1/2 mt-1.5 text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{ color: PORT_COLOR }}
      >
        Chat Model<span className="text-red-500">*</span>
      </span>
      <span
        className="absolute left-[60%] top-full -translate-x-1/2 mt-1.5 text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{ color: PORT_COLOR }}
      >
        Memory
      </span>
      <span
        className="absolute left-[80%] top-full -translate-x-1/2 mt-1.5 text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{ color: PORT_COLOR }}
      >
        Tools {toolCount > 0 && `(${toolCount})`}
      </span>
    </div>
  );
});

AIAgentNode.displayName = "AIAgentNode";