// Random secret for webhook URLs. Uses Web Crypto, so it works in the browser.
export const generateSecret = () => {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
