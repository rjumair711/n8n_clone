"use client"

import { useNodesData, useReactFlow } from "@xyflow/react"
import { ShieldAlertIcon } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Switch } from "./ui/switch"

type ErrorSettings = {
    onError?: "stop" | "continue";
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
    executeOnce?: boolean;
}

/**
 * n8n's node Settings tab: what happens when this node fails. The values are
 * saved in the node's data and read by the engine when the node runs.
 */
export function NodeErrorSettings({ nodeId }: { nodeId: string }) {
    const { updateNodeData } = useReactFlow()
    const settings = (useNodesData(nodeId)?.data ?? {}) as ErrorSettings

    const update = (values: ErrorSettings) => updateNodeData(nodeId, values)

    const customised =
        settings.onError === "continue" || !!settings.retryOnFail || !!settings.executeOnce

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    size="sm"
                    variant="ghost"
                    title="Error handling"
                    className={customised ? "text-amber-600" : undefined}
                >
                    <ShieldAlertIcon className="size-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-4" align="start">
                <div className="space-y-2">
                    <Label>On Error</Label>
                    <Select
                        value={settings.onError || "stop"}
                        onValueChange={(value) => update({ onError: value as ErrorSettings["onError"] })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="stop">Stop Workflow</SelectItem>
                            <SelectItem value="continue">Continue</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        With Continue, later nodes still run and can read{" "}
                        <code>{"{{error.message}}"}</code>.
                    </p>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor={`retry-${nodeId}`}>Retry On Fail</Label>
                    <Switch
                        id={`retry-${nodeId}`}
                        checked={!!settings.retryOnFail}
                        onCheckedChange={(checked) => update({ retryOnFail: checked })}
                    />
                </div>

                {settings.retryOnFail && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor={`tries-${nodeId}`}>Max Tries</Label>
                            <Input
                                id={`tries-${nodeId}`}
                                type="number"
                                min={2}
                                max={5}
                                value={settings.maxTries ?? 3}
                                onChange={(event) => update({ maxTries: Number(event.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`wait-${nodeId}`}>Wait (ms)</Label>
                            <Input
                                id={`wait-${nodeId}`}
                                type="number"
                                min={0}
                                max={5000}
                                step={100}
                                value={settings.waitBetweenTries ?? 1000}
                                onChange={(event) => update({ waitBetweenTries: Number(event.target.value) })}
                            />
                        </div>
                    </div>
                )}

                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor={`once-${nodeId}`}>Execute Once</Label>
                        <Switch
                            id={`once-${nodeId}`}
                            checked={!!settings.executeOnce}
                            onCheckedChange={(checked) => update({ executeOnce: checked })}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        After a list node, run for the first item only
                        instead of once per item.
                    </p>
                </div>

                <p className="text-xs text-muted-foreground">
                    Save the workflow to apply these settings.
                </p>
            </PopoverContent>
        </Popover>
    )
}
