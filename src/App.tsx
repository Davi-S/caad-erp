import { useState } from "react";
import { Plus, Minus, ArrowLeft, Pencil, Check, Copy, ShoppingBag } from "lucide-react";

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

const CATALOG = [
    { id: "brig", name: "Brigadeiro", price: 2, emoji: "🍫" },
    { id: "cox", name: "Coxinha", price: 5, emoji: "🍗" },
    { id: "past", name: "Pastel", price: 6, emoji: "🥟" },
    { id: "suco", name: "Suco natural", price: 4, emoji: "🥤" },
    { id: "bolo", name: "Bolo de pote", price: 7, emoji: "🍮" },
    { id: "agua", name: "Água", price: 3, emoji: "💧" },
];

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

function PhoneChrome({ children }) {
    return (
        <div
            className="relative w-full h-full flex flex-col overflow-hidden"
            style={{ background: C.paper }}
        >
            <div className="flex items-center justify-between px-6 pt-3 pb-1 shrink-0">
                <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.inkSoft }}>9:41</span>
                <div className="flex gap-1 items-end">
                    <div style={{ width: 3, height: 5, background: C.inkSoft }} />
                    <div style={{ width: 3, height: 7, background: C.inkSoft }} />
                    <div style={{ width: 3, height: 9, background: C.inkSoft }} />
                    <div style={{ width: 3, height: 11, background: C.inkFaint }} />
                </div>
            </div>
            {children}
        </div>
    );
}

// ---------------- Screen 1: pick seller ----------------
function SellerScreen({ sellers, setSellers, selected, setSelected, onNext }) {
    return (
        <PhoneChrome>
            <div className="flex-1 flex flex-col px-6 pt-4 pb-6 overflow-y-auto">
                <Eyebrow step={1} label="Vendedor" />
                <h1
                    className="mt-1 mb-6 leading-tight"
                    style={{ fontFamily: F_DISPLAY, color: C.ink, fontSize: 26, fontWeight: 700 }}
                >
                    Quem tá vendendo hoje?
                </h1>

                <div className="flex flex-col gap-2">
                    {sellers.map((name, i) => {
                        const isSel = selected === name;
                        return (
                            <button
                                key={name}
                                onClick={() => setSelected(name)}
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
                                    {name.charAt(0)}
                                </div>
                                <span style={{ fontFamily: F_BODY, color: C.ink, fontWeight: 600, fontSize: 15 }}>
                                    {name}
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
                        onClick={() => {
                            const next = "Vendedor " + (sellers.length + 1);
                            setSellers([...sellers, next]);
                            setSelected(next);
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                        style={{ border: `1.5px dashed ${C.inkFaint}`, background: "transparent" }}
                    >
                        <div
                            className="rounded-full flex items-center justify-center shrink-0"
                            style={{ width: 40, height: 40, border: `1.5px dashed ${C.inkFaint}` }}
                        >
                            <Plus size={16} color={C.inkSoft} />
                        </div>
                        <span style={{ fontFamily: F_BODY, color: C.inkSoft, fontWeight: 600, fontSize: 15 }}>
                            Novo vendedor
                        </span>
                    </button>
                </div>
            </div>

            <div className="px-6 pb-7 pt-3 shrink-0" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
                <button
                    disabled={!selected}
                    onClick={onNext}
                    className="w-full py-3.5 rounded-2xl transition-opacity"
                    style={{
                        background: selected ? C.ink : C.inkFaint,
                        color: "#fff",
                        fontFamily: F_DISPLAY,
                        fontWeight: 700,
                        fontSize: 15,
                        opacity: selected ? 1 : 0.6,
                    }}
                >
                    Começar venda
                </button>
            </div>
        </PhoneChrome>
    );
}

// ---------------- Screen 2: cart ----------------
function CartScreen({ seller, qty, setQty, onBack, onClose }) {
    const items = CATALOG.map((p) => ({ ...p, qty: qty[p.id] || 0 })).filter((p) => p.qty > 0);
    const total = items.reduce((s, p) => s + p.qty * p.price, 0);

    const inc = (id) => setQty((q) => ({ ...q, [id]: (q[id] || 0) + 1 }));
    const dec = (id) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) - 1) }));

    return (
        <PhoneChrome>
            <div className="px-6 pt-4 shrink-0">
                <Eyebrow step={2} label="Carrinho" />
                <div className="flex items-center gap-2 mb-4">
                    <button onClick={onBack} className="p-1 -ml-1">
                        <ArrowLeft size={20} color={C.ink} />
                    </button>
                    <h1 style={{ fontFamily: F_DISPLAY, color: C.ink, fontSize: 20, fontWeight: 700 }}>
                        Venda de {seller}
                    </h1>
                    <button onClick={onBack} className="ml-auto p-1">
                        <Pencil size={14} color={C.inkFaint} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6">
                <p
                    className="text-xs uppercase tracking-wider mb-2"
                    style={{ fontFamily: F_BODY, color: C.inkFaint, fontWeight: 600, letterSpacing: "0.1em" }}
                >
                    Toque para adicionar
                </p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                    {CATALOG.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => inc(p.id)}
                            className="flex flex-col items-center justify-center gap-1 rounded-2xl py-3 relative"
                            style={{ background: C.card, border: `1px solid ${C.paperLine}` }}
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
                                {brl(p.price)}
                            </span>
                        </button>
                    ))}
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

            <div className="px-6 pt-3 pb-7 shrink-0" style={{ borderTop: `1.5px dashed ${C.inkFaint}` }}>
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
        </PhoneChrome>
    );
}

// ---------------- Screen 3: PIX QR ----------------
function PixScreen({ total, status, setStatus, onNewSale }) {
    const [copied, setCopied] = useState(false);
    const confirmed = status === "confirmed";

    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-5" style={{ background: C.ink }}>
            <Eyebrow step={3} label="Pagamento" />
            <div className="relative w-full max-w-xs mt-2">
                {confirmed && (
                    <div
                        className="stamp-anim absolute z-10"
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

                <div className="torn-top" style={{ background: C.card, paddingTop: 20 }}>
                    <div className="flex flex-col items-center px-6 pb-7">
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
                            {!confirmed && <span className="pulse-dot ml-1">●</span>}
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
                {!confirmed ? (
                    <button
                        onClick={() => setStatus("confirmed")}
                        className="w-full py-3.5 rounded-2xl"
                        style={{ background: C.teal, color: "#fff", fontFamily: F_DISPLAY, fontWeight: 700, fontSize: 14 }}
                    >
                        Já recebi o pagamento
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
        </div>
    );
}

export default function App() {
    const [screen, setScreen] = useState("seller"); // seller | cart | pix
    const [sellers, setSellers] = useState(["Maria", "João"]);
    const [selected, setSelected] = useState(null);
    const [qty, setQty] = useState({});
    const [pixStatus, setPixStatus] = useState("waiting");

    const total = CATALOG.reduce((s, p) => s + (qty[p.id] || 0) * p.price, 0);

    return (
        <div
            className="w-full min-h-screen flex items-center justify-center p-6"
            style={{
                fontFamily: F_BODY,
                background: `radial-gradient(circle, ${C.paperLine} 1px, transparent 1px) ${C.paper}`,
                backgroundSize: "18px 18px",
            }}
        >
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        @keyframes stampIn {
          0% { transform: scale(2.2) rotate(-25deg); opacity: 0; }
          60% { transform: scale(0.92) rotate(-8deg); opacity: 1; }
          100% { transform: scale(1) rotate(-12deg); opacity: 1; }
        }
        .stamp-anim { animation: stampIn 0.5s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:.25} }
        .pulse-dot { display:inline-block; animation: pulseDot 1.2s ease-in-out infinite; color: #C98A2C; }
        .torn-top {
          clip-path: polygon(0% 10px,4% 0px,8% 10px,12% 0px,16% 10px,20% 0px,24% 10px,28% 0px,32% 10px,36% 0px,40% 10px,44% 0px,48% 10px,52% 0px,56% 10px,60% 0px,64% 10px,68% 0px,72% 10px,76% 0px,80% 10px,84% 0px,88% 10px,92% 0px,96% 10px,100% 0px,100% 100%,0% 100%);
        }
      `}</style>

            <div
                className="relative rounded-[2.5rem] shadow-2xl overflow-hidden"
                style={{ width: 380, height: 760, border: `8px solid ${C.ink}`, background: C.ink }}
            >
                <div className="w-full h-full rounded-[2rem] overflow-hidden">
                    {screen === "seller" && (
                        <SellerScreen
                            sellers={sellers}
                            setSellers={setSellers}
                            selected={selected}
                            setSelected={setSelected}
                            onNext={() => setScreen("cart")}
                        />
                    )}
                    {screen === "cart" && (
                        <CartScreen
                            seller={selected}
                            qty={qty}
                            setQty={setQty}
                            onBack={() => setScreen("seller")}
                            onClose={() => {
                                setPixStatus("waiting");
                                setScreen("pix");
                            }}
                        />
                    )}
                    {screen === "pix" && (
                        <PixScreen
                            total={total}
                            status={pixStatus}
                            setStatus={setPixStatus}
                            onNewSale={() => {
                                setQty({});
                                setScreen("cart");
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
