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
            message: "Must start with a letter/underscore and contain only letters, numbers, and underscores"
        }),
    operation: z.enum(["add", "subtract", "multiply", "divide", "round", "floor", "ceil"]),
    inputA: z.string().min(1, "First number/variable is required"),
    inputB: z.string().optional(),
});

export type CalculatorFormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: CalculatorFormValues) => void;
    defaultValues?: Partial<CalculatorFormValues>;
}

export const CalculatorDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}
}: Props) => {
    const form = useForm<CalculatorFormValues>({
        defaultValues: {
            variableName: defaultValues.variableName || "calculatorResult",
            operation: defaultValues.operation || "add",
            inputA: defaultValues.inputA || "",
            inputB: defaultValues.inputB || "",
        }
    });

    useEffect(() => {
        if (open) {
            form.reset({
                variableName: defaultValues.variableName || "calculatorResult",
                operation: defaultValues.operation || "add",
                inputA: defaultValues.inputA || "",
                inputB: defaultValues.inputB || "",
            });
        }
    }, [open, defaultValues, form]);

    const watchOperation = form.watch("operation");
    const watchVariableName = form.watch("variableName") || "calculatorResult";

    const isBinaryOperation = ["add", "subtract", "multiply", "divide"].includes(watchOperation);

    const handleSubmit = (values: CalculatorFormValues) => {
        onSubmit?.(values);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Calculator Configuration</DialogTitle>
                    <DialogDescription>
                        Perform mathematical operations on numbers or variables.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4 mt-4 pb-2">
                        
                        <div className="flex gap-4 w-full">
                            <FormField
                                control={form.control}
                                name="variableName"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>Variable Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="calculatorResult" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            Reference later: {`{{${watchVariableName}.result}}`}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="operation"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>Operation</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="add">Add (+)</SelectItem>
                                                <SelectItem value="subtract">Subtract (-)</SelectItem>
                                                <SelectItem value="multiply">Multiply (×)</SelectItem>
                                                <SelectItem value="divide">Divide (÷)</SelectItem>
                                                <SelectItem value="round">Round to nearest</SelectItem>
                                                <SelectItem value="floor">Round down (Floor)</SelectItem>
                                                <SelectItem value="ceil">Round up (Ceil)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="flex gap-4 w-full items-start">
                            <FormField
                                control={form.control}
                                name="inputA"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>Value A</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. 10 or {{price}}" {...field} />
                                        </FormControl>
                                        <FormDescription>Supports Handlebars</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {isBinaryOperation && (
                                <FormField
                                    control={form.control}
                                    name="inputB"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormLabel>Value B</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. 5 or {{tax}}" {...field} />
                                            </FormControl>
                                            <FormDescription>Supports Handlebars</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>

                        <DialogFooter className="mt-4">
                            <Button type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};