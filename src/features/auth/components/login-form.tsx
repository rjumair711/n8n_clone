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


const loginSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(1, "Password is required"),
})


type LoginFormValues = z.infer<typeof loginSchema>


export function LoginForm() {
    const router = useRouter()

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: ""
        }
    })

    const signInGithub = async () => {
        await authClient.signIn.social({
            provider: "github"
        }, {
            onSuccess: () => {
                router.push("/workflows");;
            },
            onError: () => {
                toast.error("Something went wrong")
            }
        })
    }

    const signInGoogle = async () => {
        await authClient.signIn.social({
            provider: "google"
        }, {
            onSuccess: () => {
                router.push("/workflows");;
            },
            onError: () => {
                toast.error("Something went wrong")
            }
        })
    }

    // Single sign-on: the email's domain says which identity provider, and
    // the browser is sent there. No password is asked for here.
    const signInSso = async () => {
        const email = form.getValues("email").trim()

        if (!email.includes("@")) {
            toast.error("Enter your work email first, then press Sign in with SSO")
            return
        }

        await authClient.signIn.sso({
            email,
            callbackURL: "/workflows",
            errorCallbackURL: "/login",
        }, {
            onError: (ctx) => {
                toast.error(
                    ctx.error.status === 404
                        ? "Single sign-on is not set up for this email's domain"
                        : ctx.error.message || "Single sign-on could not be started"
                )
            }
        })
    }

    const onSubmit = async (values: LoginFormValues) => {
        await authClient.signIn.email({
            email: values.email,
            password: values.password,
            callbackURL: "/workflows",
        }, {
            onSuccess: (ctx) => {
                // Two-factor is on: the auth client is already opening the
                // page that asks for the code
                if ((ctx.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return;

                router.push("/workflows");
            },
            onError: (ctx) => {
                toast.error(ctx.error.message)
            }
        })
    }

    const isPending = form.formState.isSubmitting

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle>
                        Welcome back
                    </CardTitle>
                    <CardDescription>
                        Login to continue
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                            <div className="grid gap-6">
                                <div className="flex flex-col gap-4">
                                    <Button
                                    onClick={signInGithub}
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
                                    onClick={signInGoogle}
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
                                    <Button
                                        onClick={signInSso}
                                        variant="outline"
                                        className="w-full"
                                        type="button"
                                        disabled={isPending}
                                        title="Sign in through your company's identity provider. Enter your work email below first.">
                                        Sign in with SSO
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
                                    <div className="-mt-3 text-right text-sm">
                                        <Link href="/forgot-password"
                                            className="underline underline-offset-4 text-muted-foreground">Forgot your password?</Link>
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isPending}>Login</Button>
                                </div>
                                <div className="text-center text-sm">
                                    Don't have an account? {" "}
                                    <Link href="/signup"
                                        className="underline underline-offset-4">Sign up</Link>
                                </div>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    )
}