import Link from "next/link"
import { RxjLogo } from "@/features/marketing/components/rxj-logo"

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <>
            <div className='bg-muted flex min-h-svh items-center flex-col justify-center gap-6 p-6 md:p-10'>
                <div className='flex w-full max-w-sm flex-col gap-6'>
                    <Link href="/" aria-label="RXJ home" className="self-center">
                        {/* The logo is drawn for a dark background: on this light page it gets a dark tile */}
                        <RxjLogo height={30} tile priority />
                    </Link>
                    {children}
                </div>
            </div>
        </>
    )
}
