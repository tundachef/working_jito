// jito_tip_cache.ts

import axios from "axios";

const TIP_ENDPOINT = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";

let cached95th: number | null = null;
let cached99th: number | null = null;
let lastUpdated: number = 0;
const CACHE_DURATION_MS = 1.2 * 60 * 1000; // 1.2 minutes

export async function getCachedJitoTip(useNinetyNinth: boolean = false): Promise<number> {
    // return 0.008 * 1e9
    const now = Date.now();
    const isFresh = now - lastUpdated < CACHE_DURATION_MS;

    if (isFresh) {
        if (useNinetyNinth && cached99th !== null) return cached99th;
        if (!useNinetyNinth && cached95th !== null) return cached95th;
    }

    try {
        const res = await axios.get(TIP_ENDPOINT);
        const entry = res.data?.[0];
        console.log(`Entry jip tips: ${JSON.stringify(entry, null, 2)}`)

        if (entry) {
            const tip95 = entry.landed_tips_95th_percentile;
            const tip99 = entry.landed_tips_99th_percentile;

            if (typeof tip95 === "number") cached95th = Math.round(tip95 * 1e9);
            if (typeof tip99 === "number") cached99th = Math.round(tip99 * 1e9);
            lastUpdated = now;

            console.log(`🔁 Refreshed Jito tip floor — 95th: ${cached95th}, 99th: ${cached99th}`);
            return useNinetyNinth ? cached99th! : cached95th!;
        }

        throw new Error("Invalid Jito tip structure");
    } catch (err) {
        console.warn("⚠️ Failed to fetch tip floor, using cached or fallback", err);
        if (useNinetyNinth && cached99th !== null) return cached99th;
        if (!useNinetyNinth && cached95th !== null) return cached95th;
        return 5000; // fallback minimum (0.000005 SOL)
    }
}

// The most reasonable is 95th percentile
// [
//   {
//     "time": "2024-09-01T12:58:00Z",
//     "landed_tips_25th_percentile": 6.001000000000001e-06,
//     "landed_tips_50th_percentile": 1e-05,
//     "landed_tips_75th_percentile": 3.6196500000000005e-05,
//     "landed_tips_95th_percentile": 0.0014479055000000002,
//     "landed_tips_99th_percentile": 0.010007999,
//     "ema_landed_tips_50th_percentile": 9.836078125000002e-06
//   }
// ]