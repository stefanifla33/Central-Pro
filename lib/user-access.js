const DEFAULT_TRIAL_HOURS = 24;
const { getPlan } = require("./plans");

function bearerToken(header) {
    const match = /^Bearer\s+([^\s]+)$/i.exec(String(header || "").trim());
    return match ? match[1] : "";
}

function createUserAccessService({ supabaseUrl, publishableKey, fetchImpl = global.fetch } = {}) {
    const url = String(supabaseUrl || "").replace(/\/+$/, "");
    const key = String(publishableKey || "").trim();

    async function getAccess(authorization) {
        const token = bearerToken(authorization);
        if (!token) return { httpStatus: 401, body: { error: "unauthorized" } };
        if (!url || !key || typeof fetchImpl !== "function") {
            return { httpStatus: 503, body: { error: "access_not_configured" } };
        }

        const authResponse = await fetchImpl(`${url}/auth/v1/user`, {
            headers: { apikey: key, Authorization: `Bearer ${token}` }
        });
        if (!authResponse.ok) return { httpStatus: 401, body: { error: "unauthorized" } };
        const user = await authResponse.json();
        if (!user?.id) return { httpStatus: 401, body: { error: "unauthorized" } };

        const accessResponse = await fetchImpl(`${url}/rest/v1/rpc/ensure_user_access`, {
            method: "POST",
            headers: {
                apikey: key,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: "{}"
        });
        if (!accessResponse.ok) {
            console.error("[AUTH-ACCESS] validation failed");
            return { httpStatus: 503, body: { error: "access_unavailable" } };
        }

        const raw = await accessResponse.json();
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row || typeof row.allowed !== "boolean") {
            return { httpStatus: 503, body: { error: "access_unavailable" } };
        }
        if (row.created) console.info("[TRIAL-CREATED]");
        if (row.status === "expired") console.info("[TRIAL-EXPIRED]");
        const plan = getPlan(row.plan_id);
        return {
            httpStatus: 200,
            body: {
                allowed: row.allowed,
                status: row.status,
                trialStartedAt: row.trial_started_at,
                trialEndsAt: row.trial_ends_at,
                remainingSeconds: row.remaining_seconds === null ? null : (Number(row.remaining_seconds) || 0),
                planId: plan?.id || null,
                planName: plan?.name || null,
                accessExpiresAt: row.access_expires_at || null
            }
        };
    }

    return { getAccess };
}

module.exports = { DEFAULT_TRIAL_HOURS, bearerToken, createUserAccessService };
