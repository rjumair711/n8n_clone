"use client";

import {
    BaseEdge,
    EdgeLabelRenderer,
    EdgeProps,
    getBezierPath,
} from "@xyflow/react";

export const ExecutionEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
}: EdgeProps) => {

    const [edgePath] =
        getBezierPath({
            sourceX,
            sourceY,
            sourcePosition,

            targetX,
            targetY,
            targetPosition,
        });

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    strokeWidth: 2,

                    stroke:
                        "#3b82f6",

                    strokeDasharray:
                        "8 6",
                    strokeLinecap: "round",
                    opacity: 0.9,

                    animation:
                        "flowAnimation 1s linear infinite",

                    ...style,
                }}
            />

            <EdgeLabelRenderer>
                <style>
                    {`
            @keyframes flowAnimation {
              from {
                stroke-dashoffset: 10;
              }

              to {
                stroke-dashoffset: 0;
              }
            }
          `}
                </style>
            </EdgeLabelRenderer>
        </>
    );
};