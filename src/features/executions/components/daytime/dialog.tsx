"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import z from "zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
    variableName: z
        .string()
        .min(1, { message: "Variable name is required" })
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
            message: "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores"
        }),
    operation: z.enum(["current", "format", "manipulate", "compare"]),
    timezone: z.string().min(1, "Timezone is required"),
    inputDate: z.string().optional(),
    formatString: z.string().optional(),
    action: z.enum(["add", "subtract"]).optional(),
    amount: z.coerce.number().optional(),
    unit: z.enum(["seconds", "minutes", "hours", "days", "weeks", "months", "years"]).optional(),
    compareDate: z.string().optional(),
});

export type DateTimeFormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: z.infer<typeof formSchema>) => void;
    defaultValues?: Partial<DateTimeFormValues>;
}

const COMMON_TIMEZONES = [
    "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles",
    "Europe/London", "Europe/Paris", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney"
];

export const DateTimeDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}
}: Props) => {
    const form = useForm<z.infer<typeof formSchema>>({
        defaultValues: {
            variableName: defaultValues.variableName || "myDate",
            operation: defaultValues.operation || "current",
            timezone: defaultValues.timezone || "UTC",
            inputDate: defaultValues.inputDate || "",
            formatString: defaultValues.formatString || "YYYY-MM-DDTHH:mm:ssZ",
            action: defaultValues.action || "add",
            amount: defaultValues.amount || 1,
            unit: defaultValues.unit || "days",
            compareDate: defaultValues.compareDate || "",
        }
    });

    useEffect(() => {
        if (open) {
            form.reset({
                variableName: defaultValues.variableName || "myDate",
                operation: defaultValues.operation || "current",
                timezone: defaultValues.timezone || "UTC",
                inputDate: defaultValues.inputDate || "",
                formatString: defaultValues.formatString || "YYYY-MM-DDTHH:mm:ssZ",
                action: defaultValues.action || "add",
                amount: defaultValues.amount || 1,
                unit: defaultValues.unit || "days",
                compareDate: defaultValues.compareDate || "",
            });
        }
    }, [open, defaultValues, form]);

    const watchVariableName = form.watch("variableName") || "myDate";
    const watchOperation = form.watch("operation");

    const handleSubmit = (values: z.infer<typeof formSchema>) => {
        onSubmit?.(values);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Date & Time Configuration</DialogTitle>
                    <DialogDescription>
                        Get, format, manipulate, or compare dates.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 mt-4 pb-2">

                        <FormField
                            control={form.control}
                            name="variableName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Variable Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="myDate" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Reference the result later: {`{{${watchVariableName}.result}}`}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="operation"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Operation</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="current">Get Current Time</SelectItem>
                                                <SelectItem value="format">Format Date</SelectItem>
                                                <SelectItem value="manipulate">Add/Subtract Time</SelectItem>
                                                <SelectItem value="compare">Compare Dates</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="timezone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Timezone</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {COMMON_TIMEZONES.map(tz => (
                                                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* INPUT DATE (Hidden for 'current') */}
                        {watchOperation !== "current" && (
                            <FormField
                                control={form.control}
                                name="inputDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Input Date (Optional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="{{trigger.createdAt}} or leave blank for now" {...field} />
                                        </FormControl>
                                        <FormDescription>Supports {"{{variables}}"}. Leave blank to use current time.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {/* MANIPULATE FIELDS */}
                        {watchOperation === "manipulate" && (
                            <div className="grid grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name="action"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Action</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    <SelectItem value="add">Add</SelectItem>
                                                    <SelectItem value="subtract">Subtract</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Amount</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="unit"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Unit</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {["seconds", "minutes", "hours", "days", "weeks", "months", "years"].map(u => (
                                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}

                        {/* COMPARE FIELDS */}
                        {watchOperation === "compare" && (
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="compareDate"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Compare To Date</FormLabel>
                                            <FormControl>
                                                <Input placeholder="{{trigger.expiresAt}}" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="unit"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Difference Unit</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {["seconds", "minutes", "hours", "days", "weeks", "months", "years"].map(u => (
                                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}

                        {/* FORMATTING (Hidden for compare) */}
                        {watchOperation !== "compare" && (
                            <FormField
                                control={form.control}
                                name="formatString"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Output Format</FormLabel>
                                        <FormControl>
                                            <Input placeholder="YYYY-MM-DD HH:mm:ss" {...field} />
                                        </FormControl>
                                        <FormDescription>Day.js format string (e.g., YYYY-MM-DD)</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <DialogFooter className="mt-4">
                            <Button type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};