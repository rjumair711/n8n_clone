"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import z from "zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "@/app/text-formatter.css";

const formSchema = z.object({
    variableName: z
        .string()
        .min(1, { message: "Variable name is required" })
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
            message: "Must start with a letter/underscore and contain only letters, numbers, and underscores"
        }),
    operation: z.enum(["uppercase", "lowercase", "trim", "replace", "extract"]),
    inputText: z.string().min(1, "Input text is required"),
    searchString: z.string().optional(),
    replaceString: z.string().optional(),
    regexPattern: z.string().optional(),
});

export type TextFormatterFormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: TextFormatterFormValues) => void;
    defaultValues?: Partial<TextFormatterFormValues>;
}

export const TextFormatterDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}
}: Props) => {
    const form = useForm<TextFormatterFormValues>({
        defaultValues: {
            variableName: defaultValues.variableName || "formattedText",
            operation: defaultValues.operation || "trim",
            inputText: defaultValues.inputText || "",
            searchString: defaultValues.searchString || "",
            replaceString: defaultValues.replaceString || "",
            regexPattern: defaultValues.regexPattern || "",
        }
    });

    useEffect(() => {
        if (open) {
            form.reset({
                variableName: defaultValues.variableName || "formattedText",
                operation: defaultValues.operation || "trim",
                inputText: defaultValues.inputText || "",
                searchString: defaultValues.searchString || "",
                replaceString: defaultValues.replaceString || "",
                regexPattern: defaultValues.regexPattern || "",
            });
        }
    }, [open, defaultValues, form]);

    const watchOperation = form.watch("operation");
    const watchVariableName = form.watch("variableName") || "formattedText";

    const handleSubmit = (values: TextFormatterFormValues) => {
        onSubmit?.(values);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Text Formatter Configuration</DialogTitle>
                    <DialogDescription>
                        Transform, clean, or extract strings.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="text-formatter-form">
                        
                        <div className="text-formatter-row">
                            <FormField
                                control={form.control}
                                name="variableName"
                                render={({ field }) => (
                                    <FormItem className="text-formatter-col">
                                        <FormLabel>Variable Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="formattedText" {...field} />
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
                                    <FormItem className="text-formatter-col">
                                        <FormLabel>Operation</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="uppercase">Uppercase</SelectItem>
                                                <SelectItem value="lowercase">Lowercase</SelectItem>
                                                <SelectItem value="trim">Trim Whitespace</SelectItem>
                                                <SelectItem value="replace">Replace</SelectItem>
                                                <SelectItem value="extract">Extract (Regex)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="inputText"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Input Text</FormLabel>
                                    <FormControl>
                                        <Input placeholder="{{trigger.body.message}}" {...field} />
                                    </FormControl>
                                    <FormDescription>Supports Handlebars variables</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {watchOperation === "replace" && (
                            <div className="text-formatter-row">
                                <FormField
                                    control={form.control}
                                    name="searchString"
                                    render={({ field }) => (
                                        <FormItem className="text-formatter-col">
                                            <FormLabel>Search For</FormLabel>
                                            <FormControl><Input placeholder="word to remove" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="replaceString"
                                    render={({ field }) => (
                                        <FormItem className="text-formatter-col">
                                            <FormLabel>Replace With</FormLabel>
                                            <FormControl><Input placeholder="new word" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}

                        {watchOperation === "extract" && (
                            <FormField
                                control={form.control}
                                name="regexPattern"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Regex Pattern</FormLabel>
                                        <FormControl>
                                            <Input placeholder="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" {...field} />
                                        </FormControl>
                                        <FormDescription>Returns the first exact match</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <DialogFooter className="text-formatter-footer">
                            <Button type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};