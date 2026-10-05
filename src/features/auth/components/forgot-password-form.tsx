"use client"

import { useState } from "react"
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

const forgotPasswordSchema = z.object({
    email: z.email("Please enter a valid email address"),
})

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm() {
    const [sent, setSent] = useState(false)

    const form = useForm<ForgotPasswordFormValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: { email: "" },
    })

    const onSubmit = async (values: ForgotPasswordFormValues) => {
        await authClient.requestPasswordReset(
            {
                email: values.email,
                // The link in the email comes back here with a token
                redirectTo: "/reset-password",
            },
            {
                // The same answer whether or not the address has an account,
                // so the form cannot be used to find out who is registered
                onSuccess: () => setSent(true),
                onError: (ctx) => {
                    toast.error(ctx.error?.message || "Something went wrong")
                },
            }
        )
    }

    const isPending = form.formState.isSubmitting

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle>Reset your password</CardTitle>
                    <CardDescription>
                        {sent
                            ? "If an account exists for that address, we sent a link to choose a new password. It works for one hour."
                            : "Enter your email and we will send you a link to choose a new password."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!sent && (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)}>
                                <div className="grid gap-6">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input type="email"
                                                        placeholder="m@example.com"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={isPending}>Send reset link</Button>
                                </div>
                            </form>
                        </Form>
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
