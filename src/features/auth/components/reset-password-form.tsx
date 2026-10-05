"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import z from "zod"
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { toast } from "sonner"

const resetPasswordSchema = z.object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string(),
})
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ["confirmPassword"]
    })

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm({
    token,
    invalid,
}: {
    // From the link in the email
    token?: string;
    // The link was already used or is older than an hour
    invalid?: boolean;
}) {
    const router = useRouter()

    const form = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { password: "", confirmPassword: "" },
    })

    const onSubmit = async (values: ResetPasswordFormValues) => {
        if (!token) return;

        await authClient.resetPassword(
            { newPassword: values.password, token },
            {
                onSuccess: () => {
                    toast.success("Password changed. You can log in now.")
                    router.push("/login")
                },
                onError: (ctx) => {
                    toast.error(ctx.error?.message || "The link is no longer valid")
                },
            }
        )
    }

    const isPending = form.formState.isSubmitting
    const usable = !!token && !invalid

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle>Choose a new password</CardTitle>
                    <CardDescription>
                        {usable
                            ? "Enter the new password for your account."
                            : "This reset link is no longer valid. Request a new one."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {usable ? (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)}>
                                <div className="grid gap-6">
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>New password</FormLabel>
                                                <FormControl>
                                                    <Input type="password"
                                                        placeholder="*********"
                                                        autoComplete="new-password"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="confirmPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Confirm new password</FormLabel>
                                                <FormControl>
                                                    <Input type="password"
                                                        placeholder="*********"
                                                        autoComplete="new-password"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={isPending}>Change password</Button>
                                </div>
                            </form>
                        </Form>
                    ) : (
                        <Button asChild className="w-full">
                            <Link href="/forgot-password">Request a new link</Link>
                        </Button>
                    )}
                    <div className="mt-6 text-center text-sm">
                        <Link href="/login"
                            className="underline underline-offset-4">Back to login</Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
