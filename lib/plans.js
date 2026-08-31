const PLANS = Object.freeze({
    monthly: Object.freeze({ id: "monthly", name: "Mensal", price: 19.90, durationMonths: 1 }),
    quarterly: Object.freeze({ id: "quarterly", name: "Trimestral", price: 49.90, durationMonths: 3 })
});

function getPlan(planId) {
    return PLANS[String(planId || "").trim()] || null;
}

module.exports = { PLANS, getPlan };
