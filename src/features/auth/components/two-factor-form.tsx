"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { authClient } from "@/lib/auth-client"

// The second step of a password sign-in for an account with two-factor on
export function TwoFactorForm() {
    const router = useRouter()

    const [useBackupCode, setUseBackupCode] = useState(false)
    const [code, setCode] = useState("")
    const [trustDevice, setTrustDevice] = useState(false)
    const [isPending, setIsPending] = useState(false)

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        setIsPending(true)

        const value = code.trim()

        const { error } = useBackupCode
            ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice })
            : await authClient.twoFactor.verifyTotp({ code: value.replace(/\s+/g, ""), trustDevice })

        setIsPending(false)

        if (error) {
            toast.error(error.message || "That code did not work")
            return
        }

        router.push("/workflows")
    }

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle>Two-factor authentication</CardTitle>
                    <CardDescription>
                        {useBackupCode
                            ? "Enter one of your backup codes. Each code works once."
                            : "Enter the 6-digit code from your authenticator app."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="grid gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="two-factor-code">
                                {useBackupCode ? "Backup code" : "Code"}
                            </Label>
                            <Input
                                id="two-factor-code"
                                autoFocus
                                autoComplete="one-time-code"
                                inputMode={useBackupCode ? "text" : "numeric"}
                                placeholder={useBackupCode ? "xxxxx-xxxxx" : "123456"}
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="two-factor-trust"
                                checked={trustDevice}
                                onCheckedChange={(checked) => setTrustDevice(checked === true)}
                            />
                            <Label htmlFor="two-factor-trust" className="font-normal">
                                Do not ask on this device for 30 days
                            </Label>
                        </div>
                        <Button type="submit" className="w-full" disabled={isPending || !code.trim()}>
                            Verify
                        </Button>
                        <div className="flex justify-between text-sm">
                            <button
                                type="button"
                                className="underline underline-offset-4 text-muted-foreground"
                                onClick={() => {
                                    setUseBackupCode(!useBackupCode)
                                    setCode("")
                                }}
                            >
                                {useBackupCode ? "Use the authenticator app" : "Use a backup code"}
                            </button>
                            <Link href="/login" className="underline underline-offset-4 text-muted-foreground">
                                Back to login
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
