"use client";

import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormField, FormControl,
  FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { CredentialType } from "@prisma/client";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";

// UPDATED: Multi-operation dynamic validation schema
const formSchema = z.object({
  credentialId: z.string().min(1, "Credential is required"),
  operation: z.enum(["create", "update", "delete", "list"]),
  calendarId: z.string().min(1, "Calendar ID is required"),
  eventId: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  query: z.string().optional(),
  maxResults: z.string().optional(),
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message: "Must start with a letter or underscore",
    }),
}).superRefine((data, ctx) => {
  // Validate fields for CREATE operation
  if (data.operation === "create") {
    if (!data.summary || data.summary.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Event title is required", path: ["summary"] });
    }
    if (!data.startTime || data.startTime.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start time is required", path: ["startTime"] });
    }
    if (!data.endTime || data.endTime.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End time is required", path: ["endTime"] });
    }
  }
  if (data.operation === "list") {
    if (!data.timeMin?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start of range is required", path: ["timeMin"] });
    }
    if (!data.timeMax?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End of range is required", path: ["timeMax"] });
    }
    if (data.maxResults?.trim() && !/^\d+$/.test(data.maxResults.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A whole number, up to 250", path: ["maxResults"] });
    }
  }
  // Validate fields for UPDATE or DELETE operations
  if (data.operation === "update" || data.operation === "delete") {
    if (!data.eventId || data.eventId.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Event ID is required", path: ["eventId"] });
    }
  }
});

export type GoogleCalendarFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: GoogleCalendarFormValues) => void;
  defaultValues?: Partial<GoogleCalendarFormValues>;
}

export const GoogleCalendarDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  // Either a service account or a Google account connected with OAuth
  const serviceAccounts = useCredentialsByType(CredentialType.GOOGLE_CALENDAR);
  const googleAccounts = useCredentialsByType(CredentialType.GOOGLE_OAUTH2);
  const credentials = [
    ...(googleAccounts.data ?? []),
    ...(serviceAccounts.data ?? []),
  ];
  const isLoading = serviceAccounts.isLoading || googleAccounts.isLoading;

  const form = useForm<GoogleCalendarFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      credentialId: defaultValues.credentialId || "",
      operation: defaultValues.operation || "create",
      calendarId: defaultValues.calendarId || "primary",
      eventId: defaultValues.eventId || "",
      summary: defaultValues.summary || "",
      description: defaultValues.description || "",
      startTime: defaultValues.startTime || "",
      endTime: defaultValues.endTime || "",
      timeMin: defaultValues.timeMin || "",
      timeMax: defaultValues.timeMax || "",
      query: defaultValues.query || "",
      maxResults: defaultValues.maxResults || "",
      variableName: defaultValues.variableName || "calendarResult",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        credentialId: defaultValues.credentialId || "",
        operation: defaultValues.operation || "create",
        calendarId: defaultValues.calendarId || "primary",
        eventId: defaultValues.eventId || "",
        summary: defaultValues.summary || "",
        description: defaultValues.description || "",
        startTime: defaultValues.startTime || "",
        endTime: defaultValues.endTime || "",
        timeMin: defaultValues.timeMin || "",
        timeMax: defaultValues.timeMax || "",
        query: defaultValues.query || "",
        maxResults: defaultValues.maxResults || "",
        variableName: defaultValues.variableName || "calendarResult",
      });
    }
  }, [open, defaultValues, form]);

  // Watch fields to dynamically adjust UI states
  const watchOperation = form.watch("operation") || "create";
  const watchVariableName = form.watch("variableName") || "calendarResult";

  const handleSubmit = (values: GoogleCalendarFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  const operationLabel = watchOperation === "list"
    ? "List"
    : watchOperation.charAt(0).toUpperCase() + watchOperation.slice(1);
  const resultHint = watchOperation === "list"
    ? `{{${watchVariableName}.isFree}}, {{${watchVariableName}.count}} and {{${watchVariableName}.events}}`
    : `{{${watchVariableName}.htmlLink}}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{operationLabel} Google Calendar {watchOperation === "list" ? "Events" : "Event"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-2">

            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google Calendar Credential</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading || !credentials?.length}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={
                          isLoading ? "Loading..." :
                          !credentials?.length ? "No credentials found" :
                          "Select a credential"
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((cred) => (
                        <SelectItem key={cred.id} value={cred.id}>{cred.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* NEW: Operation dropdown picker */}
            <FormField
              control={form.control}
              name="operation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operation</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select action" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="create">Create Event</SelectItem>
                      <SelectItem value="update">Update Event</SelectItem>
                      <SelectItem value="delete">Delete Event</SelectItem>
                      <SelectItem value="list">List Events</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="calendarId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Calendar ID</FormLabel>
                  <FormControl>
                    <Input placeholder="primary or specific email" {...field} />
                  </FormControl>
                  <FormDescription>Use "primary" or the specific calendar email address.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* NEW: Event ID Input - Only visible during Update or Delete actions */}
            {(watchOperation === "update" || watchOperation === "delete") && (
              <FormField
                control={form.control}
                name="eventId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. {{nodeName.eventId}} or static ID" {...field} />
                    </FormControl>
                    <FormDescription>Pass the target event ID manually or dynamically.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {watchOperation === "list" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="timeMin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start of range</FormLabel>
                        <FormControl>
                          <Input placeholder="{{booking.start}}" {...field} />
                        </FormControl>
                        <FormDescription>ISO, e.g. 2026-12-31T10:00:00+05:00</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="timeMax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End of range</FormLabel>
                        <FormControl>
                          <Input placeholder="{{booking.end}}" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="query"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Search (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Haircut" {...field} />
                      </FormControl>
                      <FormDescription>Only events whose title, description, location or guests contain this text.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxResults"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Events (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="50" inputMode="numeric" {...field} />
                      </FormControl>
                      <FormDescription>
                        50 by default, 250 at most. Every event that overlaps the range is listed;
                        isFree is true when none of them blocks the time (cancelled events and events
                        marked &quot;Free&quot; do not).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Content inputs - Hidden during Delete and List operations */}
            {watchOperation !== "delete" && watchOperation !== "list" && (
              <>
                <FormField
                  control={form.control}
                  name="summary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Title{watchOperation === "update" && " (Optional)"}</FormLabel>
                      <FormControl>
                        <Input placeholder="Meeting with {{name}}" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Discussing {{topic}}" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time{watchOperation === "update" && " (Optional)"}</FormLabel>
                        <FormControl>
                          <Input placeholder="{{webhook.startTime}}" {...field} />
                        </FormControl>
                        <FormDescription>ISO format (e.g., 2026-12-31T10:00:00Z)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time{watchOperation === "update" && " (Optional)"}</FormLabel>
                        <FormControl>
                          <Input placeholder="{{webhook.endTime}}" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder="calendarResult" {...field} />
                  </FormControl>
                  <FormDescription>
                    Reference this result later: {resultHint}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};