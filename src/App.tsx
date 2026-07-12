import { useEffect, useState } from "react";
import { Plus, Minus, ArrowLeft, Pencil, Check, Copy, ShoppingBag, AlertTriangle, Loader2 } from "lucide-react";

// ---- Design tokens (paper-ledger / carimbo identity) ----
const C = {
    paper: "#FAF6EC",
    paperLine: "#E4DCC7",
    card: "#FFFDF7",
    ink: "#21302A",
    inkSoft: "#5C6B62",
    inkFaint: "#9AA79F",
    teal: "#0E8F7E",
    tealDark: "#0B6F62",
    tealSoft: "#DCEFEA",
    stamp: "#B23A2E",
    stampSoft: "#F4DEDB",
    mustard: "#C98A2C",
};

const F_DISPLAY = "'Space Grotesk', sans-serif";
const F_BODY = "'Inter', sans-serif";
const F_MONO = "'IBM Plex Mono', monospace";

// ---------------- CAAD-ERP API client ----------------
// Local-network-only API. See caad-erp-api-docs.json for the full OpenAPI spec.
const API_BASE = "http://192.168.0.164:8000";

async function apiFetch(path, options = {}) {
    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            headers: { "Content-Type": "application/json" },
            ...options,
        });
    } catch (err) {
        throw new Error(
            `Não foi possível conectar à API do CAAD-ERP em ${API_BASE}. Verifique se ela está rodando na rede local.`
        );
    }

    let body = null;
    try {
        body = await res.json();
    } catch {
        // No JSON body (e.g. empty response) - that's fine.
    }

    if (!res.ok) {
        let detail = res.statusText;
        if (body) {
            if (typeof body.detail === "string") detail = body.detail;
            else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d.msg).join("; ");
        }
        throw new Error(detail || `Erro ${res.status}`);
    }
    return body;
}

const api = {
    listProducts: () => apiFetch("/products"),
    listSalesmen: () => apiFetch("/salesmen"),
    createSalesman: (salesman_id, salesman_name) =>
        apiFetch("/salesmen", {
            method: "POST",
            body: JSON.stringify({ salesman_id, salesman_name }),
        }),
    getStockReport: () => apiFetch("/reports/stock"),
    recordSale: (payload) =>
        apiFetch("/transactions/sale", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
};

// Products from the API don't carry an emoji, so we guess one from the name
// and fall back to a generic icon for anything we don't recognize.
const EMOJI_BY_KEYWORD = {
    brigadeiro: "🍫",
    coxinha: "🍗",
    pastel: "🥟",
    suco: "🥤",
    bolo: "🍮",
    agua: "💧",
    água: "💧",
    refrigerante: "🥤",
    cafe: "☕",
    café: "☕",
    pao: "🥖",
    pão: "🥖",
    doce: "🍬",
    salgado: "🥐",
};
function emojiFor(name) {
    const key = (name || "").toLowerCase();
    for (const kw in EMOJI_BY_KEYWORD) {
        if (key.includes(kw)) return EMOJI_BY_KEYWORD[kw];
    }
    return "🧺";
}

function slugify(str) {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "");
}

const AVATAR_COLORS = [C.teal, C.stamp, C.mustard];

function brl(n) {
    return "R$ " + n.toFixed(2).replace(".", ",");
}

// Deterministic mock QR pattern (visual only, not a real payload)
const QR_SIZE = 11;
function buildQrGrid() {
    const grid = [];
    for (let r = 0; r < QR_SIZE; r++) {
        const row = [];
        for (let c = 0; c < QR_SIZE; c++) {
            const isFinderBlock =
                (r < 3 && c < 3) || (r < 3 && c >= QR_SIZE - 3) || (r >= QR_SIZE - 3 && c < 3);
            let filled;
            if (isFinderBlock) {
                const lr = r < 3 ? r : r - (QR_SIZE - 3);
                const lc = c < 3 ? c : c - (QR_SIZE - 3);
                filled = lr === 0 || lr === 2 || lc === 0 || lc === 2 || (lr === 1 && lc === 1);
            } else {
                filled = (r * 13 + c * 7 + r * c) % 5 < 2;
            }
            row.push(filled);
        }
        grid.push(row);
    }
    return grid;
}
const QR_GRID = buildQrGrid();

function Eyebrow({ step, label }) {
    return (
        <div className="flex items-center gap-2 mb-1">
            <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ fontFamily: F_MONO, background: C.tealSoft, color: C.tealDark, fontWeight: 600 }}
            >
                {step}/3
            </span>
            <span
                className="text-xs uppercase tracking-wider"
                style={{ fontFamily: F_BODY, color: C.inkFaint, letterSpacing: "0.12em", fontWeight: 600 }}
            >
                {label}
            </span>
        </div>
    );
}

function ScreenShell({ children }) {
    return (
        <div
            className="relative w-full min-h-[100svh] flex flex-col overflow-hidden"
            style={{
                background: C.paper,
                paddingTop: "max(0.75rem, env(safe-area-inset-top))",
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                paddingLeft: "max(0px, env(safe-area-inset-left))",
                paddingRight: "max(0px, env(safe-area-inset-right))",
            }}
        >
            {children}
        </div>
    );
}

// ---------------- Loading / error shell for API calls ----------------
function StatusScreen({ mode, message, onRetry }) {
    return (
        <ScreenShell>
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
                {mode === "loading" ? (
                    <Loader2 size={28} color={C.teal} className="animate-spin" />
                ) : (
                    <AlertTriangle size={28} color={C.stamp} />
                )}
                <p style={{ fontFamily: F_BODY, color: C.ink, fontSize: 14, fontWeight: 600 }}>
                    {mode === "loading" ? "Carregando dados do CAAD-ERP..." : "Não deu pra falar com o CAAD-ERP"}
                </p>
                {message && (
                    <p style={{ fontFamily: F_BODY, color: C.inkFaint, fontSize: 13 }}>{message}</p>
                )}
                {mode === "error" && onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-2 px-4 py-2.5 rounded-2xl"
                        style={{ background: C.ink, color: "#fff", fontFamily: F_DISPLAY, fontWeight: 700, fontSize: 14 }}
                    >
                        Tentar de novo
                    </button>
                )}
            </div>
        </ScreenShell>
    );
}

// ---------------- Screen 1: pick seller ----------------
function SellerScreen({ sellers, selectedId, setSelectedId, onCreateSeller, creating, onNext }) {
    return (
        <ScreenShell>
            <div className="flex-1 flex flex-col px-4 sm:px-6 pt-4 pb-6 overflow-y-auto">
                <Eyebrow step={1} label="Vendedor" />
                <h1
                    className="mt-1 mb-6 leading-tight"
                    style={{ fontFamily: F_DISPLAY, color: C.ink, fontSize: 26, fontWeight: 700 }}
                >
                    Quem tá vendendo hoje?
                </h1>

                <div className="flex flex-col gap-2">
                    {sellers.length === 0 && (
                        <p style={{ fontFamily: F_BODY, color: C.inkFaint, fontSize: 13 }}>
                            Nenhum vendedor cadastrado ainda no CAAD-ERP.
                        </p>
                    )}
                    {sellers.map((s, i) => {
                        const isSel = selectedId === s.id;
                        return (
                            <button
                                key={s.id}
                                onClick={() => setSelectedId(s.id)}
                                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all"
                                style={{
                                    background: isSel ? C.tealSoft : C.card,
                                    border: `1.5px solid ${isSel ? C.teal : C.paperLine}`,
                                }}
                            >
                                <div
                                    className="rounded-full flex items-center justify-center shrink-0"
                                    style={{
                                        width: 40,
                                        height: 40,
                                        background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                                        color: "#fff",
                                        fontFamily: F_DISPLAY,
                                        fontWeight: 700,
                                        fontSize: 16,
                                    }}
                                >
                                    {s.name.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontFamily: F_BODY, color: C.ink, fontWeight: 600, fontSize: 15 }}>
                                    {s.name}
                                </span>
                                {isSel && (
                                    <span className="ml-auto">
                                        <Check size={18} color={C.teal} />
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    <button
                        disabled={creating}
                        onClick={onCreateSeller}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                        style={{ border: `1.5px dashed ${C.inkFaint}`, background: "transparent", opacity: creating ? 0.6 : 1 }}
                    >
                        <div
                            className="rounded-full flex items-center justify-center shrink-0"
                            style={{ width: 40, height: 40, border: `1.5px dashed ${C.inkFaint}` }}
                        >
                            <Plus size={16} color={C.inkSoft} />
                        </div>
                        <span style={{ fontFamily: F_BODY, color: C.inkSoft, fontWeight: 600, fontSize: 15 }}>
                            {creating ? "Cadastrando..." : "Novo vendedor"}
                        </span>
                    </button>
                </div>
            </div>

            <div className="px-4 sm:px-6 pb-7 pt-3 shrink-0" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
                <button
                    disabled={!selectedId}
                    onClick={onNext}
                    className="w-full py-3.5 rounded-2xl transition-opacity"
                    style={{
                        background: selectedId ? C.ink : C.inkFaint,
                        color: "#fff",
                        fontFamily: F_DISPLAY,
                        fontWeight: 700,
                        fontSize: 15,
                        opacity: selectedId ? 1 : 0.6,
                    }}
                >
                    Começar venda
                </button>
            </div>
        </ScreenShell>
    );
}

// ---------------- Screen 2: cart ----------------
function CartScreen({ seller, products, stock, qty, setQty, onBack, onClose }) {
    const items = products.map((p) => ({ ...p, qty: qty[p.id] || 0 })).filter((p) => p.qty > 0);
    const total = items.reduce((s, p) => s + p.qty * p.price, 0);

    const availableFor = (id) => stock[id];
    const inc = (id) =>
        setQty((q) => {
            const current = q[id] || 0;
            const available = availableFor(id);
            if (available !== undefined && current >= available) return q;
            return { ...q, [id]: current + 1 };
        });
    const dec = (id) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) - 1) }));

    return (
        <ScreenShell>
            <div className="px-4 sm:px-6 pt-4 shrink-0">
                <Eyebrow step={2} label="Carrinho" />
                <div className="flex items-center gap-2 mb-4">
                    <button onClick={onBack} className="p-1 -ml-1">
                        <ArrowLeft size={20} color={C.ink} />
                    </button>
                    <h1 style={{ fontFamily: F_DISPLAY, color: C.ink, fontSize: 20, fontWeight: 700 }}>
                        Venda de {seller?.name}
                    </h1>
                    <button onClick={onBack} className="ml-auto p-1">
                        <Pencil size={14} color={C.inkFaint} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6">
                <p
                    className="text-xs uppercase tracking-wider mb-2"
                    style={{ fontFamily: F_BODY, color: C.inkFaint, fontWeight: 600, letterSpacing: "0.1em" }}
                >
                    Toque para adicionar
                </p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                    {products.map((p) => {
                        const available = availableFor(p.id);
                        const soldOut = available !== undefined && available <= 0;
                        return (
                            <button
                                key={p.id}
                                onClick={() => inc(p.id)}
                                disabled={soldOut}
                                className="flex flex-col items-center justify-center gap-1 rounded-2xl py-3 relative"
                                style={{
                                    background: C.card,
                                    border: `1px solid ${C.paperLine}`,
                                    opacity: soldOut ? 0.45 : 1,
                                }}
                            >
                                {qty[p.id] > 0 && (
                                    <span
                                        className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center"
                                        style={{
                                            width: 20,
                                            height: 20,
                                            background: C.teal,
                                            color: "#fff",
                                            fontFamily: F_MONO,
                                            fontSize: 11,
                                            fontWeight: 600,
                                        }}
                                    >
                                        {qty[p.id]}
                                    </span>
                                )}
                                <span style={{ fontSize: 20 }}>{p.emoji}</span>
                                <span style={{ fontFamily: F_BODY, color: C.ink, fontSize: 12, fontWeight: 600 }}>
                                    {p.name}
                                </span>
                                <span style={{ fontFamily: F_MONO, color: C.inkSoft, fontSize: 11 }}>
                                    {soldOut ? "Esgotado" : brl(p.price)}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div style={{ borderTop: `1px dashed ${C.paperLine}` }} className="pt-3">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-10 gap-2">
                            <ShoppingBag size={28} color={C.inkFaint} />
                            <p style={{ fontFamily: F_BODY, color: C.inkFaint, fontSize: 13 }}>
                                Nenhum item ainda.
                                <br />
                                Toque em um produto acima pra começar.
                            </p>
                        </div>
                    ) : (
                        items.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 py-2">
                                <span style={{ fontSize: 16 }}>{p.emoji}</span>
                                <span
                                    style={{ fontFamily: F_BODY, color: C.ink, fontSize: 14, fontWeight: 500 }}
                                    className="flex-1"
                                >
                                    {p.name}
                                </span>
                                <div className="flex items-center gap-2 rounded-full px-1" style={{ background: C.paper, border: `1px solid ${C.paperLine}` }}>
                                    <button onClick={() => dec(p.id)} className="p-1">
                                        <Minus size={12} color={C.inkSoft} />
                                    </button>
                                    <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.ink, minWidth: 14, textAlign: "center" }}>
                                        {p.qty}
                                    </span>
                                    <button onClick={() => inc(p.id)} className="p-1">
                                        <Plus size={12} color={C.inkSoft} />
                                    </button>
                                </div>
                                <span style={{ fontFamily: F_MONO, color: C.ink, fontSize: 13, minWidth: 62, textAlign: "right" }}>
                                    {brl(p.qty * p.price)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="px-4 sm:px-6 pt-3 pb-7 shrink-0" style={{ borderTop: `1.5px dashed ${C.inkFaint}` }}>
                <div className="flex items-baseline justify-between mb-3">
                    <span style={{ fontFamily: F_BODY, color: C.inkSoft, fontSize: 13, fontWeight: 600 }}>
                        Total
                    </span>
                    <span style={{ fontFamily: F_MONO, color: C.ink, fontSize: 24, fontWeight: 600 }}>
                        {brl(total)}
                    </span>
                </div>
                <button
                    disabled={total === 0}
                    onClick={onClose}
                    className="w-full py-3.5 rounded-2xl"
                    style={{
                        background: total > 0 ? C.teal : C.inkFaint,
                        color: "#fff",
                        fontFamily: F_DISPLAY,
                        fontWeight: 700,
                        fontSize: 15,
                        opacity: total > 0 ? 1 : 0.6,
                    }}
                >
                    Fechar venda
                </button>
            </div>
        </ScreenShell>
    );
}

// ---------------- Screen 3: PIX QR ----------------
function PixScreen({ total, status, error, onConfirm, onNewSale }) {
    const [copied, setCopied] = useState(false);
    const confirmed = status === "confirmed";
    const confirming = status === "confirming";

    return (
        <div
            className="w-full min-h-[100svh] flex flex-col items-center justify-center px-4 sm:px-5"
            style={{
                background: C.ink,
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                paddingLeft: "max(1rem, env(safe-area-inset-left))",
                paddingRight: "max(1rem, env(safe-area-inset-right))",
            }}
        >
            <Eyebrow step={3} label="Pagamento" />
            <div className="relative w-full max-w-xs mt-2">
                {confirmed && (
                    <div
                        className="absolute z-10"
                        style={{
                            top: -14,
                            right: -6,
                            width: 84,
                            height: 84,
                            borderRadius: "50%",
                            border: `3px solid ${C.stamp}`,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            transform: "rotate(-12deg)",
                            background: "rgba(178,58,46,0.06)",
                        }}
                    >
                        <span style={{ fontFamily: F_DISPLAY, color: C.stamp, fontWeight: 700, fontSize: 15, letterSpacing: "0.05em" }}>
                            PAGO
                        </span>
                        <Check size={14} color={C.stamp} />
                    </div>
                )}

                <div style={{ background: C.card, paddingTop: 20 }}>
                    <div className="flex flex-col items-center px-4 sm:px-6 pb-7">
                        <span
                            className="mb-1"
                            style={{
                                fontFamily: F_BODY,
                                fontWeight: 700,
                                fontSize: 12,
                                letterSpacing: "0.14em",
                                color: confirmed ? C.teal : C.mustard,
                            }}
                        >
                            {confirmed ? "PAGAMENTO CONFIRMADO" : "AGUARDANDO PAGAMENTO"}
                            {!confirmed && <span className="animate-pulse ml-1">●</span>}
                        </span>

                        <div
                            className="grid my-4"
                            style={{ gridTemplateColumns: `repeat(${QR_SIZE}, 15px)`, gridTemplateRows: `repeat(${QR_SIZE}, 15px)` }}
                        >
                            {QR_GRID.flatMap((row, r) =>
                                row.map((cell, c) => (
                                    <div
                                        key={r + "-" + c}
                                        style={{ width: 15, height: 15, background: cell ? C.ink : "transparent" }}
                                    />
                                ))
                            )}
                        </div>

                        <span style={{ fontFamily: F_MONO, color: C.ink, fontSize: 26, fontWeight: 600 }}>
                            {brl(total)}
                        </span>
                        <span style={{ fontFamily: F_BODY, color: C.inkFaint, fontSize: 12, marginTop: 2 }}>
                            Pix • código de pagamento
                        </span>

                        <button
                            onClick={() => {
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1500);
                            }}
                            className="flex items-center gap-2 mt-4 px-3 py-2 rounded-xl w-full justify-center"
                            style={{ background: C.paper, border: `1px solid ${C.paperLine}` }}
                        >
                            <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.inkSoft }}>
                                {copied ? "Copiado!" : "pix •••• 8f2a-91cd"}
                            </span>
                            <Copy size={13} color={C.inkSoft} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-xs mt-6">
                {error && (
                    <p
                        className="mb-3 text-center"
                        style={{ fontFamily: F_BODY, color: C.stampSoft, fontSize: 12 }}
                    >
                        {error}
                    </p>
                )}
                {!confirmed ? (
                    <button
                        onClick={onConfirm}
                        disabled={confirming}
                        className="w-full py-3.5 rounded-2xl"
                        style={{
                            background: C.teal,
                            color: "#fff",
                            fontFamily: F_DISPLAY,
                            fontWeight: 700,
                            fontSize: 14,
                            opacity: confirming ? 0.7 : 1,
                        }}
                    >
                        {confirming ? "Registrando venda..." : "Já recebi o pagamento"}
                    </button>
                ) : (
                    <button
                        onClick={onNewSale}
                        className="w-full py-3.5 rounded-2xl"
                        style={{ background: "transparent", color: "#fff", border: "1.5px solid #ffffff55", fontFamily: F_DISPLAY, fontWeight: 700, fontSize: 14 }}
                    >
                        Nova venda
                    </button>
                )}
            </div>
        </div >
    );
}

export default function App() {
    const [screen, setScreen] = useState("seller"); // seller | cart | pix

    // ---- Data loaded from the CAAD-ERP API ----
    const [initStatus, setInitStatus] = useState("loading"); // loading | ready | error
    const [initError, setInitError] = useState("");
    const [products, setProducts] = useState([]); // [{id, name, price, emoji}]
    const [sellers, setSellers] = useState([]); // [{id, name}]
    const [stock, setStock] = useState({}); // { [productId]: quantity }

    const [selectedSellerId, setSelectedSellerId] = useState(null);
    const [creatingSeller, setCreatingSeller] = useState(false);

    const [qty, setQty] = useState({});
    const [pixStatus, setPixStatus] = useState("waiting"); // waiting | confirming | confirmed
    const [pixError, setPixError] = useState("");

    async function loadAll() {
        setInitStatus("loading");
        setInitError("");
        try {
            const [productsRes, salesmenRes, stockRes] = await Promise.all([
                api.listProducts(),
                api.listSalesmen(),
                api.getStockReport(),
            ]);

            setProducts(
                (productsRes?.items || []).map((p) => ({
                    id: p.product_id,
                    name: p.product_name,
                    price: parseFloat(p.sell_price),
                    emoji: emojiFor(p.product_name),
                }))
            );
            setSellers(
                (salesmenRes?.items || []).map((s) => ({
                    id: s.salesman_id,
                    name: s.salesman_name,
                }))
            );
            const stockMap = {};
            (stockRes?.items || []).forEach((i) => {
                stockMap[i.product_id] = parseFloat(i.quantity);
            });
            setStock(stockMap);

            setInitStatus("ready");
        } catch (err) {
            setInitError(err.message || String(err));
            setInitStatus("error");
        }
    }

    useEffect(() => {
        loadAll();
    }, []);

    async function handleCreateSeller() {
        const name = window.prompt("Nome do novo vendedor:");
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        const id = `${slugify(trimmed)}-${Date.now().toString(36).slice(-4)}`;
        setCreatingSeller(true);
        try {
            await api.createSalesman(id, trimmed);
            setSellers((prev) => [...prev, { id, name: trimmed }]);
            setSelectedSellerId(id);
        } catch (err) {
            window.alert(`Não foi possível cadastrar o vendedor: ${err.message || err}`);
        } finally {
            setCreatingSeller(false);
        }
    }

    const selectedSeller = sellers.find((s) => s.id === selectedSellerId) || null;
    const productById = Object.fromEntries(products.map((p) => [p.id, p]));
    const cartItems = products.map((p) => ({ ...p, qty: qty[p.id] || 0 })).filter((p) => p.qty > 0);
    const total = cartItems.reduce((s, p) => s + p.qty * p.price, 0);

    async function handleConfirmPayment() {
        if (!selectedSeller || cartItems.length === 0) return;
        setPixStatus("confirming");
        setPixError("");
        try {
            for (const item of cartItems) {
                await api.recordSale({
                    product_id: item.id,
                    salesman_id: selectedSeller.id,
                    quantity: item.qty,
                    total_revenue: item.qty * item.price,
                    payment_type: "PIX",
                });
            }
            // Refresh stock in the background so the next cart reflects reality.
            api.getStockReport()
                .then((stockRes) => {
                    const stockMap = {};
                    (stockRes?.items || []).forEach((i) => {
                        stockMap[i.product_id] = parseFloat(i.quantity);
                    });
                    setStock(stockMap);
                })
                .catch(() => { });
            setPixStatus("confirmed");
        } catch (err) {
            setPixError(err.message || String(err));
            setPixStatus("waiting");
        }
    }

    let content;
    if (initStatus === "loading") {
        content = <StatusScreen mode="loading" />;
    } else if (initStatus === "error") {
        content = <StatusScreen mode="error" message={initError} onRetry={loadAll} />;
    } else if (screen === "seller") {
        content = (
            <SellerScreen
                sellers={sellers}
                selectedId={selectedSellerId}
                setSelectedId={setSelectedSellerId}
                onCreateSeller={handleCreateSeller}
                creating={creatingSeller}
                onNext={() => setScreen("cart")}
            />
        );
    } else if (screen === "cart") {
        content = (
            <CartScreen
                seller={selectedSeller}
                products={products}
                stock={stock}
                qty={qty}
                setQty={setQty}
                onBack={() => setScreen("seller")}
                onClose={() => {
                    setPixStatus("waiting");
                    setPixError("");
                    setScreen("pix");
                }}
            />
        );
    } else if (screen === "pix") {
        content = (
            <PixScreen
                total={total}
                status={pixStatus}
                error={pixError}
                onConfirm={handleConfirmPayment}
                onNewSale={() => {
                    setQty({});
                    setScreen("cart");
                }}
            />
        );
    }

    return (
        <div
            className="w-full min-h-[100svh]"
            style={{
                fontFamily: F_BODY,
                background: `radial-gradient(circle, ${C.paperLine} 1px, transparent 1px) ${C.paper}`,
                backgroundSize: "18px 18px",
            }}
        >
            {content}
        </div>
    );
}
