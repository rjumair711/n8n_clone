"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type TurnstileApi = {
    render: (
        container: HTMLElement,
        options: {
            sitekey: string
            callback: (token: string) => void
            "expired-callback": () => void
            "error-callback": () => void
        }
    ) => string
    reset: (widgetId: string) => void
    remove: (widgetId: string) => void
}

declare global {
    interface Window {
        turnstile?: TurnstileApi
    }
}

// One load for the whole page, however often the widget is mounted
let scriptLoading: Promise<void> | undefined

const loadScript = () => {
    scriptLoading ??= new Promise<void>((resolve, reject) => {
        if (window.turnstile) return resolve()

        const script = document.createElement("script")
        script.src = SCRIPT_URL
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => {
            scriptLoading = undefined
            reject(new Error("Turnstile could not be loaded"))
        }
        document.head.appendChild(script)
    })

    return scriptLoading
}

export type TurnstileHandle = {
    // An answer works once: asked for again after every sign-up attempt
    reset: () => void
}

type Props = {
    siteKey: string
    // The answer to send with the form, or null while there is none
    onToken: (token: string | null) => void
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(
    function TurnstileWidget({ siteKey, onToken }, ref) {
        const container = useRef<HTMLDivElement>(null)
        const widgetId = useRef<string | null>(null)
        const onTokenRef = useRef(onToken)
        onTokenRef.current = onToken

        useImperativeHandle(ref, () => ({
            reset: () => {
                onTokenRef.current(null)
                if (widgetId.current) window.turnstile?.reset(widgetId.current)
            },
        }))

        useEffect(() => {
            let cancelled = false

            loadScript()
                .then(() => {
                    if (cancelled || !container.current || !window.turnstile) return

                    widgetId.current = window.turnstile.render(container.current, {
                        sitekey: siteKey,
                        callback: (token) => onTokenRef.current(token),
                        "expired-callback": () => onTokenRef.current(null),
                        "error-callback": () => onTokenRef.current(null),
                    })
                })
                .catch(() => onTokenRef.current(null))

            return () => {
                cancelled = true
                if (widgetId.current) window.turnstile?.remove(widgetId.current)
                widgetId.current = null
            }
        }, [siteKey])

        return <div ref={container} className="flex justify-center" />
    }
)
