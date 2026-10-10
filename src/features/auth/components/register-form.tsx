"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import z from "zod"
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { toast } from "sonner"
import Image from "next/image"
import { useRef, useState } from "react"
import { TURNSTILE_HEADER } from "@/lib/turnstile"
import { TurnstileWidget, type TurnstileHandle } from "./turnstile-widget"

const registerSchema = z.object({
    email: z.email("Please enter a valid email address"),
    password: z.string().min(1, "Password is required"),
    confirmPassword: z.string(),
})
    .refine((data) => data.password === data.confirmPassword, {
        message: "Password don't match",
        path: ["confirmPassword"]
    })

type RegisterFormValues = z.infer<typeof registerSchema>

type Props = {
    // Set when Cloudflare Turnstile is configured: the form then shows the
    // widget and sends its answer with the sign-up
    turnstileSiteKey?: string | null
}

export function RegisterForm({ turnstileSiteKey }: Props) {
    const router = useRouter()

    const turnstile = useRef<TurnstileHandle>(null)
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            email: "",
            password: "",
            confirmPassword: ""
        }
    })

    const signUpGithub = async () => {
        await authClient.signIn.social({
            provider: "github",
        }, {
            onSuccess: () => {
                router.push("/workflows");
            },
            onError: () => {
                toast.error("Something went wrong")
            }
        })
    }

    const signUpGoogle = async () => {
        await authClient.signIn.social({
            provider: "google",
        }, {
            onSuccess: () => {
                router.push("/workflows");
            },
            onError: () => {
                toast.error("Something went wrong")
            }
        })
    }

    const onSubmit = async (values: RegisterFormValues) => {
        await authClient.signUp.email(
            {
                name: values.email,
                email: values.email,
                password: values.password,
                callbackURL: "/workflows",
            },
            {
                ...(turnstileSiteKey && turnstileToken
                    ? { headers: { [TURNSTILE_HEADER]: turnstileToken } }
                    : {}),
                onSuccess: (ctx) => {
                    // No session yet: the address has to be confirmed first
                    if (!ctx.data?.token) {
                        toast.success("Check your inbox: we sent you a link to confirm your email address.")
                        router.push("/login");
                        return;
                    }

                    router.push("/workflows");
                },
                onError: (ctx) => {
                    toast.error(ctx.error?.message || "Signup failed")
                }
            }
        )

        // Turnstile accepts an answer once: the next attempt needs a new one
        turnstile.current?.reset()
    }

    const isPending = form.formState.isSubmitting

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle>
                        Get Started
                    </CardTitle>
                    <CardDescription>
                        Create your account to get started
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                            <div className="grid gap-6">
                                <div className="flex flex-col gap-4">
                                    <Button
                                        onClick={signUpGithub}
                                        variant="outline"
                                        className="w-full"
                                        type="button"
                                        disabled={isPending}>
                                        <Image src="/logos/github.svg"
                                            alt="Github"
                                            width={20}
                                            height={20}
                                        />
                                        Continue with GitHub
                                    </Button>
                                    <Button
                                        onClick={signUpGoogle}
                                        variant="outline"
                                        className="w-full"
                                        type="button"
                                        disabled={isPending}>
                                        <Image src="/logos/google.svg"
                                            alt="Google"
                                            width={20}
                                            height={20}
                                        />
                                        Continue with Google
                                    </Button>
                                </div>
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
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password"
                                                        placeholder="*********"
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
                                                <FormLabel>Confirm Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password"
                                                        placeholder="*********"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {turnstileSiteKey && (
                                        <TurnstileWidget
                                            ref={turnstile}
                                            siteKey={turnstileSiteKey}
                                            onToken={setTurnstileToken}
                                        />
                                    )}
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={isPending || (!!turnstileSiteKey && !turnstileToken)}
                                    >
                                        Sign Up
                                    </Button>
                                </div>
                                <div className="text-center text-sm">
                                    Already have an account? {" "}
                                    <Link href="/login"
                                        className="underline underline-offset-4">Login</Link>
                                </div>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    )
}