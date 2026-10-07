import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { useDebounce } from '../hooks/useDebounce';
import { format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    X, Bell, Search, MessageCircle, DollarSign,
    Calendar, AlertCircle, CheckCircle2, Loader2,
    RefreshCw, ChevronLeft, ChevronRight, User, Phone,
    AlertTriangle, Clock
} from 'lucide-react';
import { PaymentModal } from './PaymentModal';

const ITEMS_PER_PAGE = 8;

export interface DebtorItem {
    id: string;
    customer_name: string;
    cedula?: string;
    phone?: string;
    plan_name: string;
    type?: string;
    price: number;
    totalPaid: number;
    remaining: number;
    start_date?: string;
    end_date?: string;
    status_member?: string;
    photo_url?: string;
    daysLeft: number;
    isOverdue: boolean;
    isDueToday: boolean;
}

interface DebtorsNotificationModalProps {
    onClose: () => void;
    onPaymentSuccess?: () => void;
}

export function DebtorsNotificationModal({ onClose, onPaymentSuccess }: DebtorsNotificationModalProps) {
    const { user } = useAuth();
    const { rate: bcvRate } = useExchangeRate();

    const [debtors, setDebtors] = useState<DebtorItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 150);
    const [filterCategory, setFilterCategory] = useState<'todos' | 'vencidos' | 'hoy' | 'proximos'>('todos');
    const [currentPage, setCurrentPage] = useState(1);

    // Modal para abonar directamente desde la notificación
    const [paymentTarget, setPaymentTarget] = useState<DebtorItem | null>(null);

    const loadDebtors = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            // 1. Cargar miembros y pagos en paralelo
            const [membersRes, paymentsRes] = await Promise.all([
                supabase
                    .from('memberships')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('payments')
                    .select('membership_id, amount, created_at')
                    .eq('user_id', user.id)
            ]);

            if (membersRes.error) throw membersRes.error;

            // 2. Pre-indexación O(N + M) eficiente
            const memberCreatedAtMap = new Map<string, number>();
            (membersRes.data || []).forEach(m => {
                memberCreatedAtMap.set(m.id, new Date(m.created_at).getTime());
            });

            const paymentsByMember = new Map<string, number>();
            if (paymentsRes.data) {
                for (let i = 0; i < paymentsRes.data.length; i++) {
                    const p = paymentsRes.data[i];
                    const memTime = memberCreatedAtMap.get(p.membership_id);
                    if (memTime !== undefined) {
                        const pTime = new Date(p.created_at).getTime();
                        if (pTime >= memTime) {
                            const cur = paymentsByMember.get(p.membership_id) || 0;
                            paymentsByMember.set(p.membership_id, cur + Number(p.amount || 0));
                        }
                    }
                }
            }

            const now = startOfDay(new Date());
            const list: DebtorItem[] = [];

            (membersRes.data || []).forEach(m => {
                const totalPaid = paymentsByMember.get(m.id) || 0;
                const price = Number(m.price || 0);
                const remaining = Math.max(0, price - totalPaid);

                // Solo personas que deben
                if (remaining > 0) {
                    let daysLeft = 0;
                    let isOverdue = false;
                    let isDueToday = false;

                    if (m.end_date) {
                        const dueDate = startOfDay(new Date(m.end_date + 'T12:00:00'));
                        const diffTime = dueDate.getTime() - now.getTime();
                        daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));
                        isOverdue = daysLeft < 0;
                        isDueToday = daysLeft === 0;
                    }

                    list.push({
                        id: m.id,
                        customer_name: m.customer_name || 'Sin nombre',
                        cedula: m.cedula,
                        phone: m.phone,
                        plan_name: m.plan_name || m.type || 'Membresía general',
                        type: m.type,
                        price,
                        totalPaid,
                        remaining,
                        start_date: m.start_date,
                        end_date: m.end_date,
                        status_member: m.status_member || 'activo',
                        photo_url: m.photo_url,
                        daysLeft,
                        isOverdue,
                        isDueToday
                    });
                }
            });

            // Ordenar por criticidad: Vencidos primero, luego próximos a vencer
            list.sort((a, b) => {
                if (a.isOverdue && !b.isOverdue) return -1;
                if (!a.isOverdue && b.isOverdue) return 1;
                return a.daysLeft - b.daysLeft;
            });

            setDebtors(list);
        } catch (err: any) {
            console.error("Error al cargar deudores:", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadDebtors();
    }, [loadDebtors]);

    // Cerrar con Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Resetear a página 1 al filtrar
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, filterCategory]);

    // Resúmenes de deudas
    const totalDebtUSD = useMemo(() => debtors.reduce((sum, d) => sum + d.remaining, 0), [debtors]);
    const overdueCount = useMemo(() => debtors.filter(d => d.isOverdue).length, [debtors]);
    const dueTodayCount = useMemo(() => debtors.filter(d => d.isDueToday).length, [debtors]);

    // Filtrado
    const filteredDebtors = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase();
        return debtors.filter(d => {
            const matchesSearch = !term ||
                d.customer_name.toLowerCase().includes(term) ||
                (d.cedula && d.cedula.includes(term)) ||
                (d.phone && d.phone.includes(term));

            if (!matchesSearch) return false;

            if (filterCategory === 'vencidos') return d.isOverdue;
            if (filterCategory === 'hoy') return d.isDueToday;
            if (filterCategory === 'proximos') return !d.isOverdue && !d.isDueToday;

            return true;
        });
    }, [debtors, debouncedSearch, filterCategory]);

    // Paginación
    const totalPages = Math.max(1, Math.ceil(filteredDebtors.length / ITEMS_PER_PAGE));
    const paginatedDebtors = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredDebtors.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredDebtors, currentPage]);

    // Enviar WhatsApp personalizado
    const handleSendWhatsApp = (debtor: DebtorItem) => {
        if (!debtor.phone || !debtor.phone.trim()) {
            alert(`No hay número de teléfono registrado para ${debtor.customer_name}.`);
            return;
        }

        let cleanPhone = debtor.phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '58' + cleanPhone.substring(1);
        } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('58')) {
            cleanPhone = '58' + cleanPhone;
        }

        let formattedDate = 'Pendiente por definir';
        if (debtor.end_date) {
            try {
                const d = new Date(debtor.end_date + 'T12:00:00');
                formattedDate = format(d, "dd 'de' MMMM, yyyy", { locale: es });
            } catch {
                formattedDate = debtor.end_date;
            }
        }

        const bcvText = bcvRate > 0
            ? `\n💵 *Equivalente en Bs.:* Bs. ${(debtor.remaining * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tasa BCV)`
            : '';

        let statusLine = '';
        if (debtor.isOverdue) {
            statusLine = `\n⚠️ *Estado del corte:* Vencido hace ${Math.abs(debtor.daysLeft)} ${Math.abs(debtor.daysLeft) === 1 ? 'día' : 'días'}`;
        } else if (debtor.isDueToday) {
            statusLine = `\n⚠️ *Estado del corte:* Vence el día de hoy`;
        } else if (debtor.daysLeft > 0) {
            statusLine = `\nℹ️ *Estado del corte:* Vence en ${debtor.daysLeft} ${debtor.daysLeft === 1 ? 'día' : 'días'}`;
        }

        const message =
`Hola *${debtor.customer_name}*, te saludamos cordialmente de *Energym Fitness Center* 🏋️‍♂️💪

Te escribimos para recordarte tu estado de cuenta pendiente:

📌 *Plan:* ${debtor.plan_name}
💰 *Monto a pagar:* $${debtor.remaining.toFixed(2)}${bcvText}
📅 *Fecha de corte:* ${formattedDate}${statusLine}

Por favor acércate a la recepción del gimnasio o indícanos tu comprobante de pago por este medio para mantener tu membresía activa y al día.

¡Muchas gracias y seguimos entrenando juntos! 🥊⚡`;

        const encoded = encodeURIComponent(message);
        window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`, '_blank');
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-4 pt-16 md:pt-20 pb-4 animate-in fade-in duration-200">
            <div className="bg-zinc-900 text-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[86vh] md:max-h-[85vh] border border-zinc-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* CABECERA */}
                <div className="px-6 sm:px-8 py-5 border-b border-zinc-800 bg-black flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl">
                            <Bell size={22} className="animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="font-black text-white uppercase tracking-tighter text-lg sm:text-xl italic">
                                    Cobros Pendientes
                                </h2>
                                <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                                    {debtors.length} {debtors.length === 1 ? 'deudor' : 'deudores'}
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                Notificaciones de pago y mensajes directos vía WhatsApp
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadDebtors}
                            disabled={loading}
                            title="Recargar lista"
                            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all disabled:opacity-50"
                        >
                            <RefreshCw size={18} className={loading ? "animate-spin text-orange-500" : ""} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2.5 text-zinc-400 hover:text-white hover:bg-red-950/40 hover:text-red-400 rounded-xl transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* BARRA DE MÉTRICAS RÁPIDAS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 sm:p-6 bg-zinc-950 border-b border-zinc-800/80 shrink-0">
                    <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-black uppercase tracking-wider mb-1">
                            <AlertCircle size={14} className="text-amber-500" />
                            Total Deudores
                        </div>
                        <p className="text-xl font-black text-white tracking-tight">{debtors.length}</p>
                    </div>

                    <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-black uppercase tracking-wider mb-1">
                            <DollarSign size={14} className="text-emerald-500" />
                            Por Cobrar (USD)
                        </div>
                        <p className="text-xl font-black text-emerald-400 tracking-tight">${totalDebtUSD.toFixed(2)}</p>
                    </div>

                    <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-black uppercase tracking-wider mb-1">
                            <DollarSign size={14} className="text-orange-500" />
                            Por Cobrar (BCV)
                        </div>
                        <p className="text-base sm:text-lg font-black text-orange-400 tracking-tight">
                            {bcvRate > 0 ? `Bs. ${(totalDebtUSD * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}` : 'Tasa N/D'}
                        </p>
                    </div>

                    <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-black uppercase tracking-wider mb-1">
                            <AlertTriangle size={14} className="text-red-500" />
                            Corte Vencido
                        </div>
                        <p className="text-xl font-black text-red-400 tracking-tight">{overdueCount}</p>
                    </div>
                </div>

                {/* BUSCADOR Y FILTROS */}
                <div className="p-4 sm:px-6 bg-zinc-900/90 border-b border-zinc-800 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shrink-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, cédula o teléfono..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-black border border-zinc-800 rounded-xl text-xs font-bold text-white placeholder-zinc-500 outline-none focus:border-orange-500 transition-colors"
                        />
                    </div>

                    <div className="flex p-1 bg-black rounded-xl border border-zinc-800 shrink-0 self-start sm:self-auto overflow-x-auto max-w-full">
                        <button
                            onClick={() => setFilterCategory('todos')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                filterCategory === 'todos' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            Todos ({debtors.length})
                        </button>
                        <button
                            onClick={() => setFilterCategory('vencidos')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                filterCategory === 'vencidos' ? 'bg-red-950/60 text-red-400 border border-red-900/50' : 'text-zinc-500 hover:text-red-400'
                            }`}
                        >
                            Vencidos ({overdueCount})
                        </button>
                        <button
                            onClick={() => setFilterCategory('hoy')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                filterCategory === 'hoy' ? 'bg-orange-950/60 text-orange-400 border border-orange-900/50' : 'text-zinc-500 hover:text-orange-400'
                            }`}
                        >
                            Corte Hoy ({dueTodayCount})
                        </button>
                        <button
                            onClick={() => setFilterCategory('proximos')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                filterCategory === 'proximos' ? 'bg-zinc-800 text-amber-400' : 'text-zinc-500 hover:text-amber-400'
                            }`}
                        >
                            Próximos
                        </button>
                    </div>
                </div>

                {/* LISTA DE DEUDORES */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 custom-scroll">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-3">
                            <Loader2 className="animate-spin text-orange-500" size={36} />
                            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
                                Verificando estados de cuenta...
                            </p>
                        </div>
                    ) : paginatedDebtors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                            <div className="p-4 bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 rounded-full">
                                <CheckCircle2 size={36} />
                            </div>
                            <h3 className="text-base font-black uppercase tracking-tight text-zinc-200">
                                {debtors.length === 0 ? "¡Al día! No hay deudores registrados" : "No hay socios en este filtro"}
                            </h3>
                            <p className="text-xs text-zinc-500 max-w-sm">
                                {debtors.length === 0
                                    ? "Todos los socios se encuentran solventes con sus cuotas y membresías."
                                    : "Prueba buscando con otro término o seleccionando la pestaña de 'Todos'."}
                            </p>
                        </div>
                    ) : (
                        paginatedDebtors.map(debtor => {
                            let formattedDate = 'N/D';
                            if (debtor.end_date) {
                                try {
                                    const d = new Date(debtor.end_date + 'T12:00:00');
                                    formattedDate = format(d, "dd 'de' MMM, yyyy", { locale: es });
                                } catch {
                                    formattedDate = debtor.end_date;
                                }
                            }

                            const hasPhone = Boolean(debtor.phone && debtor.phone.trim() !== '');

                            return (
                                <div
                                    key={debtor.id}
                                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                                        debtor.isOverdue
                                            ? 'bg-red-950/15 border-red-900/40 hover:border-red-700/60'
                                            : debtor.isDueToday
                                            ? 'bg-orange-950/15 border-orange-900/40 hover:border-orange-700/60'
                                            : 'bg-zinc-950/80 border-zinc-800/90 hover:border-zinc-700'
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        
                                        {/* INFO SOCIO */}
                                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                            <div className="w-11 h-11 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden text-orange-500">
                                                {debtor.photo_url ? (
                                                    <img src={debtor.photo_url} alt={debtor.customer_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User size={20} />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="font-black text-white text-sm sm:text-base uppercase tracking-tight truncate">
                                                        {debtor.customer_name}
                                                    </h4>
                                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
                                                        {debtor.plan_name}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-bold mt-1 flex-wrap">
                                                    {debtor.cedula && (
                                                        <span>CI: {debtor.cedula}</span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <Phone size={11} className={hasPhone ? "text-emerald-500" : "text-zinc-600"} />
                                                        {debtor.phone || "Sin teléfono"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* FECHA DE CORTE Y MONTO A PAGAR */}
                                        <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-zinc-800/80">
                                            
                                            {/* FECHA DE CORTE */}
                                            <div className="text-left sm:text-right">
                                                <div className="flex items-center gap-1 text-[10px] font-black text-zinc-500 uppercase tracking-widest sm:justify-end">
                                                    <Calendar size={12} className="text-orange-500" />
                                                    Fecha de Corte
                                                </div>
                                                <p className="text-xs font-black text-zinc-200 mt-0.5">
                                                    {formattedDate}
                                                </p>
                                                <div className="mt-1">
                                                    {debtor.isOverdue ? (
                                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-900/60 inline-flex items-center gap-1">
                                                            <Clock size={10} /> Vencida hace {Math.abs(debtor.daysLeft)} {Math.abs(debtor.daysLeft) === 1 ? 'día' : 'días'}
                                                        </span>
                                                    ) : debtor.isDueToday ? (
                                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-orange-950/60 text-orange-400 border border-orange-900/60 inline-flex items-center gap-1 animate-pulse">
                                                            <Clock size={10} /> Vence Hoy
                                                        </span>
                                                    ) : debtor.daysLeft > 0 ? (
                                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-zinc-900 text-amber-400 border border-zinc-800 inline-flex items-center gap-1">
                                                            <Clock size={10} /> Vence en {debtor.daysLeft} {debtor.daysLeft === 1 ? 'día' : 'días'}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>

                                            {/* MONTO A PAGAR */}
                                            <div className="text-right">
                                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">
                                                    Monto a Pagar
                                                </span>
                                                <span className="text-lg sm:text-xl font-black text-emerald-400 tracking-tight">
                                                    ${debtor.remaining.toFixed(2)}
                                                </span>
                                                {bcvRate > 0 && (
                                                    <span className="text-[10px] font-bold text-zinc-500 block">
                                                        Bs. {(Math.round(debtor.remaining * bcvRate * 100) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                            </div>

                                            {/* BOTONES DE ACCIÓN: WHATSAPP Y ABONO */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleSendWhatsApp(debtor)}
                                                    disabled={!hasPhone}
                                                    title={hasPhone ? "Enviar recordatorio por WhatsApp" : "No posee número telefónico"}
                                                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg ${
                                                        hasPhone
                                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-95 cursor-pointer'
                                                            : 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'
                                                    }`}
                                                >
                                                    <MessageCircle size={15} />
                                                    <span className="hidden sm:inline">WhatsApp</span>
                                                </button>

                                                <button
                                                    onClick={() => setPaymentTarget(debtor)}
                                                    title="Registrar abono de inmediato"
                                                    className="flex items-center gap-1 px-3 py-2.5 bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95"
                                                >
                                                    <DollarSign size={15} />
                                                    <span className="hidden sm:inline">Abonar</span>
                                                </button>
                                            </div>

                                        </div>

                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* PIE DE PÁGINA CON PAGINACIÓN */}
                <div className="p-4 bg-black border-t border-zinc-800 flex justify-between items-center text-xs font-black shrink-0">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest pl-2">
                        {filteredDebtors.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredDebtors.length)} de {filteredDebtors.length}
                    </span>

                    <div className="flex items-center gap-2 pr-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-[10px] px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-orange-500 font-black">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

            </div>

            {/* MODAL DE ABONO DIRECTO */}
            {paymentTarget && (
                <PaymentModal
                    id={paymentTarget.id}
                    orderTotal={paymentTarget.price}
                    customerName={paymentTarget.customer_name}
                    onClose={() => setPaymentTarget(null)}
                    onSuccess={() => {
                        setPaymentTarget(null);
                        loadDebtors();
                        if (onPaymentSuccess) onPaymentSuccess();
                    }}
                />
            )}
        </div>
    );
}
