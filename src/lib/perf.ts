// TEMPORARY timing for the slow-page investigation. Off unless PERF_LOG=1.
// Every line starts with "[perf]" so it can be filtered in Vercel's logs.

export const perfEnabled = process.env.PERF_LOG === "1";

export const perfLog = (message: string) => {
    if (perfEnabled) console.log(`[perf] ${message}`);
};

export const perf = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (!perfEnabled) return fn();

    const start = performance.now();

    try {
        return await fn();
    } finally {
        console.log(`[perf] ${label} ${(performance.now() - start).toFixed(1)}ms`);
    }
};
