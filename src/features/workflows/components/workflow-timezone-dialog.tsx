"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatUtcOffset, isValidTimeZone, listTimeZones } from "@/lib/time-zones"
import { useSetWorkflowTimezone } from "../hooks/use-workflows"

const clockIn = (zone: string) => {
    try {
        return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", weekday: "short" }).format(new Date())
    } catch {
        return ""
    }
}

// Workflow settings → Time zone: the clock the Schedule Triggers read
export const WorkflowTimezoneDialog = ({
    workflowId,
    timezone,
    open,
    onOpenChange,
}: {
    workflowId: string
    timezone: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
}) => {
    const [value, setValue] = useState(timezone ?? "UTC")
    const setTimezone = useSetWorkflowTimezone()
    const zones = useMemo(() => listTimeZones(), [])

    useEffect(() => {
        if (open) setValue(timezone ?? "UTC")
    }, [open, timezone])

    const zone = value.trim()
    const valid = isValidTimeZone(zone)

    const save = () => {
        setTimezone.mutate(
            { id: workflowId, timezone: zone === "UTC" ? null : zone },
            { onSuccess: () => onOpenChange(false) },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Time zone</DialogTitle>
                    <DialogDescription>
                        Schedule Triggers in this workflow read their cron times on this
                        clock. &quot;0 9 * * *&quot; in Asia/Karachi runs at 9:00 in Pakistan.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="workflow-timezone">Time zone</Label>
                    <Input
                        id="workflow-timezone"
                        list="workflow-timezone-options"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder="Asia/Karachi"
                        autoComplete="off"
                        aria-invalid={!valid}
                    />
                    <datalist id="workflow-timezone-options">
                        {zones.map((option) => (
                            <option key={option} value={option}>{formatUtcOffset(option)}</option>
                        ))}
                    </datalist>
                    <p className="text-xs text-muted-foreground">
                        {valid
                            ? `${formatUtcOffset(zone)} · it is ${clockIn(zone)} there now. Daylight saving is followed.`
                            : "Type or pick a name like Asia/Karachi, Asia/Riyadh or Europe/London."}
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setValue("UTC")} disabled={setTimezone.isPending}>
                        Reset to UTC
                    </Button>
                    <Button onClick={save} disabled={!valid || setTimezone.isPending}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
