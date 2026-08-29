function isCentralProOffline(environment = process.env) {
    return String(environment.CENTRAL_PRO_OFFLINE || "").trim().toLowerCase() === "true";
}
function createOfflineError(endpoint) {
    const error = new Error("Central Pro is running in offline mode; external API data is unavailable.");
    error.code = "CENTRAL_PRO_OFFLINE";
    error.status = 503;
    error.endpoint = endpoint;
    return error;
}
function assertExternalRequestsAllowed(endpoint, options = {}) {
    if (!isCentralProOffline(options.env)) return true;
    (options.logger || console).warn(`[API-OFFLINE] EXTERNAL_REQUEST_BLOCKED endpoint=${endpoint}`);
    throw createOfflineError(endpoint);
}
module.exports = { assertExternalRequestsAllowed, createOfflineError, isCentralProOffline };
