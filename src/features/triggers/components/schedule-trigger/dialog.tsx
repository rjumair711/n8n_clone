"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import z from "zod";
import { useForm } from "react-hook-form"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock } from "lucide-react";

const formSchema = z.object({
    variableName: z
        .string()
        .min(1, { message: "Variable name is required" })
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
            message: "Variable name must start with a letter or underscore and container only letters, numbers, and underscores"
        }),
    cronExpression: z
        .string()
        .min(1, "Cron expression is required")
        .refine((val) => val.trim().split(/\s+/).length >= 5, {
            message: "Invalid cron expression. Must have at least 5 space-separated fields (m h dom mon dow)"
        }),
})

export type ScheduleFormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: z.infer<typeof formSchema>) => void;
    defaultValues?: Partial<ScheduleFormValues>
}

const CRON_PRESETS = [
    { label: "Every 5 Minutes", value: "*/5 * * * *" },
    { label: "Every Hour", value: "0 * * * *" },
    { label: "Every Day at Midnight", value: "0 0 * * *" },
    { label: "Every Week (Sunday)", value: "0 0 * * 0" },
    { label: "Every Month (1st)", value: "0 0 1 * *" },
]

export const ScheduleDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}
}: Props) => {

    const form = useForm<z.infer<typeof formSchema>>({
        defaultValues: {
            variableName: defaultValues.variableName || "scheduleTrigger",
            cronExpression: defaultValues.cronExpression || "0 * * * *",
        }
    })

    useEffect(() => {
        if (open) {
            form.reset({
                variableName: defaultValues.variableName || "scheduleTrigger",
                cronExpression: defaultValues.cronExpression || "0 * * * *",
            });
        }
    }, [open, defaultValues, form])

    const watchVariableName = form.watch("variableName") || "scheduleTrigger";

    const handlePresetChange = (value: string) => {
        form.setValue("cronExpression", value, { shouldValidate: true });
    }

    const handleSubmit = (values: z.infer<typeof formSchema>) => {
        onSubmit?.(values);
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Schedule Configuration</DialogTitle>
                    <DialogDescription>
                        Set a cron schedule to periodically trigger this workflow automatically.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(handleSubmit)}
                        className="space-y-6 mt-4 pb-2"
                    >
                        <FormField
                            control={form.control}
                            name="variableName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Variable Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="scheduleTrigger" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Use this name to reference schedule parameters inside other nodes:{" "}
                                        {`{{${watchVariableName}.timestamp}}`}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">
                                Quick Presets
                            </label>
                            <Select onValueChange={handlePresetChange}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Choose an interval layout..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {CRON_PRESETS.map((preset) => (
                                        <SelectItem key={preset.value} value={preset.value}>
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                                {preset.label} <span className="text-xs text-muted-foreground font-mono">({preset.value})</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <FormField
                            control={form.control}
                            name="cronExpression"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Cron Expression</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="*/5 * * * *" 
                                            className="font-mono text-sm"
                                            {...field} 
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Standard 5-field UNIX syntax: <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">min hour dom mon dow</code>
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="mt-4">
                            <Button type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}