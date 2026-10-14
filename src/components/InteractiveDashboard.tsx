import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { 
    TrendingUp, Users, DollarSign, Clock, AlertCircle, 
    Calendar as CalendarIcon, UserPlus, Search, 
    MessageCircle, Wallet, RefreshCw, 
    CheckCircle2, ShieldCheck, Zap, Activity, 
    BarChart3, UserCheck, CreditCard, Sparkles, X,
    ArrowRight, Loader2
} from 'lucide-react';
import { format, startOfDay, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { PaymentModal } from './PaymentModal';

interface InteractiveDashboardProps {
    onOpenNewMember: () => void;
    onOpenCalendar: () => void;
    onOpenDebtors: () => void;
    onNavigate: (tab: string) => void;
    bcvRate: number;
    onRefreshBcv: () => void;
}

interface MemberSummary {
    id: string;
    customer_name: string;
    cedula?: string;
    phone?: string;
    plan_name: string;
    price: number;
    totalPaid: number;
    remaining: number;
    start_date?: string;
    end_date?: string;
    status_member: string;
    created_at: string;
    daysRemaining: number;
    isOverdue: boolean;
    isDueToday: boolean;
    isActive: boolean;
}

interface PaymentRecord {
    id: string;
    membership_id: string;
    customer_name: string;
    amount: number;
    amount_bs?: number;
    payment_method?: string;
    reference_number?: string;
    created_at: string;
}

export function InteractiveDashboard({
    onOpenNewMember,
    onOpenCalendar,
    onOpenDebtors,
    onNavigate,
    bcvRate,
    onRefreshBcv
}: InteractiveDashboardProps) {
    const { user } = useAuth();

    // Estados de datos
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<MemberSummary[]>([]);
    const [recentPayments, setRecentPayments] = useState<PaymentRecord[]>([]);
    const [allPayments, setAllPayments] = useState<any[]>([]);
    const [financialTransactions, setFinancialTransactions] = useState<any[]>([]);

    // Estados interactivos
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 180);
    const [expirationFilter, setExpirationFilter] = useState<'all' | 'today' | 'overdue' | 'week'>('all');
    
    // Modal de Abono directo
    const [paymentTarget, setPaymentTarget] = useState<MemberSummary | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Saludo dinámico según la hora
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return { text: '¡Buenos días!', subtext: 'Listo para comenzar la jornada con energía' };
        if (hour < 18) return { text: '¡Buenas tardes!', subtext: 'El gimnasio está activo y en movimiento' };
        return { text: '¡Buenas noches!', subtext: 'Cierre de actividades y balance diario' };
    }, []);

    // Fecha actual formateada
    const formattedDate = useMemo(() => {
        return format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es });
    }, []);

    // Carga de datos centralizada
    const loadDashboardData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            const [membersRes, paymentsRes, transRes] = await Promise.all([
                supabase
                    .from('memberships')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('payments')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('transaction_date', { ascending: false })
            ]);

            const rawMembers = membersRes.data || [];
            const rawPayments = paymentsRes.data || [];
            const rawTransactions = transRes.data || [];

            // 1. Mapeo O(N + M) de miembros y pagos acumulados
            const memberCreatedAtMap = new Map<string, number>();
            const memberNameMap = new Map<string, string>();
            rawMembers.forEach(m => {
                memberCreatedAtMap.set(m.id, new Date(m.created_at).getTime());
                memberNameMap.set(m.id, m.customer_name);
            });

            const paymentsByMember = new Map<string, number>();
            rawPayments.forEach(p => {
                const memCreated = memberCreatedAtMap.get(p.membership_id);
                if (memCreated !== undefined) {
                    const pTime = new Date(p.created_at).getTime();
                    if (pTime >= memCreated) {
                        const cur = paymentsByMember.get(p.membership_id) || 0;
                        paymentsByMember.set(p.membership_id, cur + Number(p.amount || 0));
                    }
                }
            });

            // 2. Procesar miembros con estado, saldo y fechas de corte
            const today = startOfDay(new Date());
            const processedMembers: MemberSummary[] = rawMembers.map(m => {
                const totalPaid = paymentsByMember.get(m.id) || 0;
                const price = Number(m.price || 0);
                const remaining = price - totalPaid > 0 ? (price - totalPaid) : 0;
                
                let daysRemaining = 999;
                let isOverdue = false;
                let isDueToday = false;

                if (m.end_date) {
                    const parsedEnd = startOfDay(new Date(m.end_date + 'T12:00:00'));
                    daysRemaining = differenceInDays(parsedEnd, today);
                    isOverdue = daysRemaining < 0;
                    isDueToday = daysRemaining === 0;
                }

                const isInactiveStatus = 
                    m.status_member === 'inactivo' || 
                    m.status === 'inactivo' || 
                    m.status_member === 'Inactivo';

                return {
                    id: m.id,
                    customer_name: m.customer_name,
                    cedula: m.cedula,
                    phone: m.phone,
                    plan_name: m.plan_name || 'Sin plan',
                    price,
                    totalPaid,
                    remaining,
                    start_date: m.start_date,
                    end_date: m.end_date,
                    status_member: isInactiveStatus ? 'inactivo' : 'activo',
                    created_at: m.created_at,
                    daysRemaining,
                    isOverdue,
                    isDueToday,
                    isActive: !isInactiveStatus
                };
            });

            // 3. Procesar pagos enriquecidos con nombres
            const enrichedPayments: PaymentRecord[] = rawPayments.map(p => ({
                id: p.id,
                membership_id: p.membership_id,
                customer_name: memberNameMap.get(p.membership_id) || 'Cliente Registrado',
                amount: Number(p.amount || 0),
                amount_bs: p.amount_bs ? Number(p.amount_bs) : undefined,
                payment_method: p.payment_method || 'Efectivo',
                reference_number: p.reference_number,
                created_at: p.created_at
            }));

            setMembers(processedMembers);
            setAllPayments(rawPayments);
            setRecentPayments(enrichedPayments.slice(0, 8));
            setFinancialTransactions(rawTransactions);

        } catch (err) {
            console.error("Error al cargar datos del Dashboard:", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData, refreshTrigger]);

    // ====================================================================
    // CÁLCULOS ESTADÍSTICOS Y KPIS EN TIEMPO REAL
    // ====================================================================

    // Ingresos del mes actual
    const currentMonthRevenue = useMemo(() => {
        const start = startOfMonth(new Date());
        const end = endOfMonth(new Date());

        const paymentsThisMonth = allPayments.filter(p => {
            if (!p.created_at) return false;
            const pDate = new Date(p.created_at);
            return pDate >= start && pDate <= end;
        });

        const totalUSD = paymentsThisMonth.reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const totalBs = totalUSD * bcvRate;
        const count = paymentsThisMonth.length;

        return { totalUSD, totalBs, count };
    }, [allPayments, bcvRate]);

    // Socios activos vs total
    const memberStats = useMemo(() => {
        const total = members.length;
        const active = members.filter(m => m.isActive).length;
        const inactive = total - active;
        const activePercentage = total > 0 ? Math.round((active / total) * 100) : 0;

        // Nuevos miembros este mes
        const start = startOfMonth(new Date());
        const newThisMonth = members.filter(m => {
            if (!m.created_at) return false;
            return new Date(m.created_at) >= start;
        }).length;

        return { total, active, inactive, activePercentage, newThisMonth };
    }, [members]);

    // Cuentas por cobrar (Deudores)
    const debtStats = useMemo(() => {
        const debtorsList = members.filter(m => m.isActive && m.remaining > 0);
        const totalUSD = debtorsList.reduce((acc, m) => acc + m.remaining, 0);
        const totalBs = totalUSD * bcvRate;
        const count = debtorsList.length;

        return { totalUSD, totalBs, count, debtorsList };
    }, [members, bcvRate]);

    // Vencimientos próximos (Próximos 7 días)
    const expiringStats = useMemo(() => {
        const upcoming = members.filter(m => m.isActive && m.daysRemaining >= -3 && m.daysRemaining <= 7);
        const count7Days = members.filter(m => m.isActive && m.daysRemaining >= 0 && m.daysRemaining <= 7).length;
        const countToday = members.filter(m => m.isActive && m.isDueToday).length;
        const countOverdue = members.filter(m => m.isActive && m.isOverdue).length;

        return { upcoming, count7Days, countToday, countOverdue };
    }, [members]);

    // Vencimientos filtrados para el listado interactivo
    const filteredExpiringList = useMemo(() => {
        let list = members.filter(m => m.isActive);

        if (expirationFilter === 'today') {
            list = list.filter(m => m.isDueToday);
        } else if (expirationFilter === 'overdue') {
            list = list.filter(m => m.isOverdue && m.daysRemaining >= -30);
        } else if (expirationFilter === 'week') {
            list = list.filter(m => m.daysRemaining >= 0 && m.daysRemaining <= 7);
        } else {
            // 'all': vencidos recientes + próximos 7 días
            list = list.filter(m => m.daysRemaining >= -7 && m.daysRemaining <= 7);
        }

        // Ordenar: primero los más urgentes (menor daysRemaining)
        return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
    }, [members, expirationFilter]);

    // Búsqueda interactiva de socios (Instant Lookup)
    const searchResults = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase();
        if (!term) return [];

        return members.filter(m => {
            const matchesName = m.customer_name.toLowerCase().includes(term);
            const matchesCedula = m.cedula ? m.cedula.toLowerCase().includes(term) : false;
            const matchesPhone = m.phone ? m.phone.toLowerCase().includes(term) : false;
            return matchesName || matchesCedula || matchesPhone;
        }).slice(0, 6);
    }, [members, debouncedSearch]);

    // Distribución por planes
    const planDistribution = useMemo(() => {
        const map = new Map<string, { count: number; totalRevenue: number }>();
        members.forEach(m => {
            const name = m.plan_name || 'General';
            const cur = map.get(name) || { count: 0, totalRevenue: 0 };
            cur.count += 1;
            cur.totalRevenue += m.totalPaid;
            map.set(name, cur);
        });

        const list = Array.from(map.entries()).map(([name, data]) => ({
            name,
            count: data.count,
            percentage: members.length > 0 ? Math.round((data.count / members.length) * 100) : 0,
            revenue: data.totalRevenue
        }));

        return list.sort((a, b) => b.count - a.count).slice(0, 5);
    }, [members]);

    // Resumen de caja mensual (Ingresos vs Egresos / Retiros)
    const cashFlowSummary = useMemo(() => {
        const start = startOfMonth(new Date());
        const end = endOfMonth(new Date());

        let totalInversion = 0;
        let totalRetiro = 0;

        financialTransactions.forEach(t => {
            const date = new Date(t.transaction_date || t.created_at);
            if (date >= start && date <= end) {
                const amt = Number(t.amount || 0);
                if (t.type === 'inversion') totalInversion += amt;
                if (t.type === 'retiro') totalRetiro += amt;
            }
        });

        const totalInflow = currentMonthRevenue.totalUSD;
        const totalOutflow = totalInversion + totalRetiro;
        const netFlow = totalInflow - totalOutflow;

        return { totalInflow, totalInversion, totalRetiro, totalOutflow, netFlow };
    }, [currentMonthRevenue, financialTransactions]);

    // Acción para abrir WhatsApp con mensaje personalizado
    const handleSendWhatsApp = (member: MemberSummary) => {
        if (!member.phone || !member.phone.trim()) {
            alert(`No hay número de teléfono registrado para ${member.customer_name}.`);
            return;
        }

        let cleanPhone = member.phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '58' + cleanPhone.substring(1);
        } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('58')) {
            cleanPhone = '58' + cleanPhone;
        }

        let formattedCut = 'Pendiente';
        if (member.end_date) {
            try {
                formattedCut = format(new Date(member.end_date + 'T12:00:00'), "dd 'de' MMMM", { locale: es });
            } catch {
                formattedCut = member.end_date;
            }
        }

        let statusText = '';
        if (member.isOverdue) {
            statusText = `⚠️ *Tu membresía venció hace ${Math.abs(member.daysRemaining)} días.*`;
        } else if (member.isDueToday) {
            statusText = `⚠️ *Tu membresía vence el día de hoy.*`;
        } else if (member.daysRemaining <= 7) {
            statusText = `ℹ️ *Tu fecha de corte es en ${member.daysRemaining} días (${formattedCut}).*`;
        }

        const debtLine = member.remaining > 0
            ? `\n💰 *Saldo pendiente:* $${member.remaining.toFixed(2)} ${bcvRate > 0 ? `(~Bs. ${(member.remaining * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}`
            : '';

        const msg = 
`Hola *${member.customer_name}*, te saludamos cordialmente de *Energym Fitness Center* 🏋️‍♂️💪

Esperamos que estés teniendo una excelente semana de entrenamiento.

📌 *Plan:* ${member.plan_name}
📅 *Fecha de Corte:* ${formattedCut}
${statusText}${debtLine}

Te invitamos a pasar por la recepción para renovar tu suscripción y seguir dando el 100% en tus metas. ¡Te esperamos! ⚡🔥`;

        const encoded = encodeURIComponent(msg);
        window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`, '_blank');
    };

    // Estilo badge método de pago
    const getMethodBadge = (method: string) => {
        const lower = method.toLowerCase();
        if (lower.includes('efectivo') || lower.includes('cash')) {
            return { bg: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60', icon: DollarSign };
        }
        if (lower.includes('móvil') || lower.includes('movil') || lower.includes('pago')) {
            return { bg: 'bg-orange-950/40 text-orange-400 border-orange-800/60', icon: Zap };
        }
        if (lower.includes('punto') || lower.includes('tarjeta') || lower.includes('debito')) {
            return { bg: 'bg-blue-950/40 text-blue-400 border-blue-800/60', icon: CreditCard };
        }
        if (lower.includes('zelle')) {
            return { bg: 'bg-purple-950/40 text-purple-400 border-purple-800/60', icon: Sparkles };
        }
        return { bg: 'bg-zinc-800/60 text-zinc-300 border-zinc-700', icon: Wallet };
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-28 gap-4 animate-in fade-in">
                <Loader2 className="animate-spin text-orange-500" size={44} />
                <p className="text-xs font-black uppercase text-zinc-400 tracking-[0.25em]">
                    Cargando Dashboard Energym Fitness Center...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            
            {/* ==================================================================== */}
            {/* 1. HERO HEADER: BIENVENIDA, TASA BCV & ACCIONES RÁPIDAS             */}
            {/* ==================================================================== */}
            <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-black p-6 sm:p-8 rounded-[2.5rem] border border-zinc-800/90 shadow-2xl">
                {/* Glow decorativo de fondo */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>

                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-2.5 mb-2">
                            <span className="flex h-2.5 w-2.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-emerald-400">
                                Panel de Control • Energym Activo
                            </span>
                        </div>
                        
                        <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter italic">
                            {greeting.text} <span className="text-orange-500">Energym</span>
                        </h1>
                        <p className="text-zinc-400 font-medium text-xs sm:text-sm mt-1 capitalize">
                            {formattedDate} — <span className="text-zinc-500 font-normal">{greeting.subtext}</span>
                        </p>
                    </div>

                    {/* Widget Tasa BCV & Botón de Alta */}
                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        {bcvRate > 0 && (
                            <button
                                onClick={onRefreshBcv}
                                title="Haga clic para actualizar la tasa oficial BCV"
                                className="group flex items-center gap-3 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 px-4 py-3 rounded-2xl transition-all shadow-lg cursor-pointer"
                            >
                                <div className="p-1.5 bg-orange-500/10 rounded-xl text-orange-500 group-hover:rotate-180 transition-transform duration-500">
                                    <RefreshCw size={16} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Tasa Oficial BCV</p>
                                    <p className="text-sm font-black text-white">
                                        Bs. {bcvRate.toFixed(2)} <span className="text-[10px] text-zinc-500 font-bold">/ USD</span>
                                    </p>
                                </div>
                            </button>
                        )}

                        <button
                            onClick={onOpenNewMember}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-600/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border border-orange-400/30"
                        >
                            <UserPlus size={18} />
                            <span>Registrar Socio</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 2. ATAJOS RÁPIDOS INTERACTIVOS (6 MÓDULOS DE ACCESO INSTANTÁNEO)     */}
            {/* ==================================================================== */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-black uppercase tracking-[0.25em] text-zinc-400 flex items-center gap-2">
                        <Zap size={14} className="text-orange-500" /> Atajos Rápidos del Sistema
                    </h2>
                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Acciones inmediatas</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                    {/* Atajo 1: Nuevo Miembro */}
                    <button
                        onClick={onOpenNewMember}
                        className="group flex flex-col items-center text-center p-4 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-orange-500/50 rounded-[2rem] transition-all duration-200 hover:-translate-y-1 shadow-lg cursor-pointer"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 text-orange-500 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-orange-500 group-hover:text-white transition-all shadow-md">
                            <UserPlus size={22} />
                        </div>
                        <span className="font-black text-xs text-white uppercase tracking-tight group-hover:text-orange-400 transition-colors">
                            Nuevo Socio
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold mt-0.5">Inscribir cliente</span>
                    </button>

                    {/* Atajo 2: Calendario de Pagos */}
                    <button
                        onClick={onOpenCalendar}
                        className="group flex flex-col items-center text-center p-4 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-amber-500/50 rounded-[2rem] transition-all duration-200 hover:-translate-y-1 shadow-lg cursor-pointer"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-500 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-black transition-all shadow-md">
                            <CalendarIcon size={22} />
                        </div>
                        <span className="font-black text-xs text-white uppercase tracking-tight group-hover:text-amber-400 transition-colors">
                            Calendario
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold mt-0.5">Cortes mensuales</span>
                    </button>

                    {/* Atajo 3: Notificar Deudores */}
                    <button
                        onClick={onOpenDebtors}
                        className="group relative flex flex-col items-center text-center p-4 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-red-500/50 rounded-[2rem] transition-all duration-200 hover:-translate-y-1 shadow-lg cursor-pointer"
                    >
                        {debtStats.count > 0 && (
                            <span className="absolute top-3 right-3 px-1.5 py-0.5 bg-red-600 text-white font-black text-[9px] rounded-full animate-pulse border border-zinc-900">
                                {debtStats.count}
                            </span>
                        )}
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 text-red-400 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-red-600 group-hover:text-white transition-all shadow-md">
                            <AlertCircle size={22} />
                        </div>
                        <span className="font-black text-xs text-white uppercase tracking-tight group-hover:text-red-400 transition-colors">
                            Deudores
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold mt-0.5">Cobro & WhatsApp</span>
                    </button>

                    {/* Atajo 4: Miembros y Pagos */}
                    <button
                        onClick={() => onNavigate('payments')}
                        className="group flex flex-col items-center text-center p-4 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-emerald-500/50 rounded-[2rem] transition-all duration-200 hover:-translate-y-1 shadow-lg cursor-pointer"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-black transition-all shadow-md">
                            <DollarSign size={22} />
                        </div>
                        <span className="font-black text-xs text-white uppercase tracking-tight group-hover:text-emerald-400 transition-colors">
                            Abonos
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold mt-0.5">Registrar pagos</span>
                    </button>

                    {/* Atajo 5: Finanzas */}
                    <button
                        onClick={() => onNavigate('financial')}
                        className="group flex flex-col items-center text-center p-4 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-cyan-500/50 rounded-[2rem] transition-all duration-200 hover:-translate-y-1 shadow-lg cursor-pointer"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-cyan-500 group-hover:text-black transition-all shadow-md">
                            <Wallet size={22} />
                        </div>
                        <span className="font-black text-xs text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors">
                            Finanzas
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold mt-0.5">Caja & Gastos</span>
                    </button>

                    {/* Atajo 6: Todos los Socios */}
                    <button
                        onClick={() => onNavigate('members')}
                        className="group flex flex-col items-center text-center p-4 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-violet-500/50 rounded-[2rem] transition-all duration-200 hover:-translate-y-1 shadow-lg cursor-pointer"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 text-violet-400 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-violet-600 group-hover:text-white transition-all shadow-md">
                            <Users size={22} />
                        </div>
                        <span className="font-black text-xs text-white uppercase tracking-tight group-hover:text-violet-400 transition-colors">
                            Directorio
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold mt-0.5">Lista de Socios</span>
                    </button>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 3. KPIS PRINCIPALES: MÉTRICAS Y SALUD DEL GIMNASIO                   */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* KPI 1: Ingresos del Mes */}
                <div 
                    onClick={() => onNavigate('financial')}
                    className="p-5 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-emerald-500/50 rounded-[2.2rem] shadow-xl transition-all hover:scale-[1.02] cursor-pointer group flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Ingresos del Mes</span>
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                            <TrendingUp size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl lg:text-3xl font-black text-white tracking-tight">
                            ${currentMonthRevenue.totalUSD.toFixed(2)}
                        </div>
                        {bcvRate > 0 && (
                            <div className="text-xs font-bold text-emerald-400 mt-0.5">
                                Bs. {currentMonthRevenue.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        )}
                        <p className="text-[10px] text-zinc-500 font-bold mt-2 flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            {currentMonthRevenue.count} cobros registrados
                        </p>
                    </div>
                </div>

                {/* KPI 2: Socios Activos */}
                <div 
                    onClick={() => onNavigate('members')}
                    className="p-5 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-orange-500/50 rounded-[2.2rem] shadow-xl transition-all hover:scale-[1.02] cursor-pointer group flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Socios Activos</span>
                        <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl group-hover:bg-orange-500 group-hover:text-white transition-colors">
                            <Users size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl lg:text-3xl font-black text-white tracking-tight">
                            {memberStats.active} <span className="text-sm font-bold text-zinc-500">/ {memberStats.total}</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div 
                                className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-1000"
                                style={{ width: `${memberStats.activePercentage}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500 font-bold mt-2">
                            {memberStats.activePercentage}% de la matrícula activa
                        </p>
                    </div>
                </div>

                {/* KPI 3: Cuentas por Cobrar (Deuda) */}
                <div 
                    onClick={onOpenDebtors}
                    className="p-5 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-red-500/50 rounded-[2.2rem] shadow-xl transition-all hover:scale-[1.02] cursor-pointer group flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Por Cobrar</span>
                        <div className="p-2 bg-red-500/10 text-red-400 rounded-xl group-hover:bg-red-600 group-hover:text-white transition-colors">
                            <AlertCircle size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl lg:text-3xl font-black text-red-400 tracking-tight">
                            ${debtStats.totalUSD.toFixed(2)}
                        </div>
                        {bcvRate > 0 && (
                            <div className="text-xs font-bold text-red-500/80 mt-0.5">
                                Bs. {debtStats.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        )}
                        <p className="text-[10px] text-zinc-400 font-bold mt-2 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                            {debtStats.count} {debtStats.count === 1 ? 'socio con saldo' : 'socios con saldo'}
                        </p>
                    </div>
                </div>

                {/* KPI 4: Vencimientos Próximos */}
                <div 
                    onClick={() => {
                        setExpirationFilter('week');
                        const el = document.getElementById('seccion-vencimientos');
                        el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="p-5 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-amber-500/50 rounded-[2.2rem] shadow-xl transition-all hover:scale-[1.02] cursor-pointer group flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Próx. 7 Días</span>
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl group-hover:bg-amber-500 group-hover:text-black transition-colors">
                            <Clock size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl lg:text-3xl font-black text-amber-400 tracking-tight">
                            {expiringStats.count7Days} <span className="text-sm font-bold text-zinc-500">socios</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            {expiringStats.countToday > 0 && (
                                <span className="px-2 py-0.5 bg-red-950/60 text-red-400 border border-red-900/50 rounded-lg text-[9px] font-black uppercase">
                                    {expiringStats.countToday} Hoy
                                </span>
                            )}
                            <span className="text-[10px] text-zinc-500 font-bold">
                                Renovaciones cerca
                            </span>
                        </div>
                    </div>
                </div>

                {/* KPI 5: Nuevos Registros Mes */}
                <div 
                    onClick={() => onNavigate('members')}
                    className="p-5 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-cyan-500/50 rounded-[2.2rem] shadow-xl transition-all hover:scale-[1.02] cursor-pointer group flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Nuevos en el Mes</span>
                        <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl group-hover:bg-cyan-500 group-hover:text-black transition-colors">
                            <UserCheck size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl lg:text-3xl font-black text-cyan-400 tracking-tight">
                            +{memberStats.newThisMonth}
                        </div>
                        <p className="text-[10px] text-zinc-500 font-bold mt-2 flex items-center gap-1">
                            <Sparkles size={12} className="text-cyan-400" />
                            Crecimiento del ciclo
                        </p>
                    </div>
                </div>

            </div>

            {/* ==================================================================== */}
            {/* 4. BUSCADOR INTERACTIVO EN TIEMPO REAL & VERIFICADOR RÁPIDO         */}
            {/* ==================================================================== */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-[2.5rem] p-6 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                            <Search size={16} className="text-orange-500" />
                            Consulta & Estatus Rápido de Socio
                        </h3>
                        <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider mt-0.5">
                            Escribe el nombre, cédula o teléfono para verificar membresía, deuda y contactar
                        </p>
                    </div>
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <X size={12} /> Limpiar búsqueda
                        </button>
                    )}
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por Nombre, Cédula de Identidad o Teléfono..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-black/60 border border-zinc-800 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 font-bold text-sm text-white placeholder-zinc-600 transition-all shadow-inner"
                    />
                </div>

                {/* Resultados Instantáneos */}
                {searchQuery.trim().length > 0 && (
                    <div className="pt-2 animate-in fade-in duration-200">
                        {searchResults.length === 0 ? (
                            <div className="p-8 text-center bg-black/40 rounded-2xl border border-zinc-800/80">
                                <Users className="mx-auto text-zinc-600 mb-2" size={32} />
                                <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                                    No se encontró ningún socio que coincida con "{searchQuery}"
                                </p>
                                <p className="text-[10px] text-zinc-600 font-bold mt-1">
                                    Verifica la ortografía o intenta buscar por número de cédula.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {searchResults.map(member => (
                                    <div
                                        key={member.id}
                                        className="p-5 bg-black/70 border border-zinc-800 hover:border-orange-500/50 rounded-2xl flex flex-col justify-between transition-all group shadow-lg"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                <div className="overflow-hidden">
                                                    <h4 className="font-black text-white text-sm uppercase tracking-tight truncate group-hover:text-orange-400 transition-colors">
                                                        {member.customer_name}
                                                    </h4>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {member.cedula && (
                                                            <span className="text-[10px] font-bold text-zinc-400">
                                                                C.I: {member.cedula}
                                                            </span>
                                                        )}
                                                        {member.phone && (
                                                            <span className="text-[10px] font-bold text-zinc-500">
                                                                • {member.phone}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                                    member.isActive
                                                        ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/60'
                                                        : 'bg-red-950/50 text-red-400 border-red-900/60'
                                                }`}>
                                                    {member.isActive ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </div>

                                            {/* Detalles de Membresía */}
                                            <div className="p-3 bg-zinc-900/70 rounded-xl space-y-1.5 my-3 border border-zinc-800/80">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider">Plan:</span>
                                                    <span className="font-black text-white">{member.plan_name} (${member.price})</span>
                                                </div>
                                                
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider">Corte / Vencimiento:</span>
                                                    <span className={`font-black ${
                                                        member.isOverdue 
                                                            ? 'text-red-400' 
                                                            : member.isDueToday 
                                                            ? 'text-amber-400' 
                                                            : 'text-zinc-300'
                                                    }`}>
                                                        {member.end_date 
                                                            ? format(new Date(member.end_date + 'T12:00:00'), "dd MMM yyyy", { locale: es }) 
                                                            : 'Sin fecha'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center text-xs pt-1 border-t border-zinc-800/50">
                                                    <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider">Saldo por pagar:</span>
                                                    <span className={`font-black ${member.remaining > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                        {member.remaining > 0 ? `$${member.remaining.toFixed(2)}` : 'Al día ($0.00)'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Botones de acción directa */}
                                        <div className="flex items-center gap-2 pt-1">
                                            {member.phone && (
                                                <button
                                                    onClick={() => handleSendWhatsApp(member)}
                                                    title="Enviar recordatorio por WhatsApp"
                                                    className="flex-1 py-2 px-3 bg-emerald-950/40 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-900/50 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                                >
                                                    <MessageCircle size={14} /> WhatsApp
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setPaymentTarget(member)}
                                                className="flex-1 py-2 px-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                                            >
                                                <DollarSign size={14} /> Abonar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ==================================================================== */}
            {/* 5. DOS COLUMNAS DE INTELIGENCIA: VENCIMIENTOS Y FEED DE PAGOS       */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* COLUMNA IZQUIERDA (7 COLS): PRÓXIMOS VENCIMIENTOS Y RENOVACIONES */}
                <div id="seccion-vencimientos" className="lg:col-span-7 space-y-4">
                    <div className="bg-zinc-900/90 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-7 shadow-2xl flex flex-col h-full">
                        
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                            <div>
                                <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                                    <Clock size={18} className="text-amber-500" />
                                    Vencimientos & Renovaciones
                                </h3>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                                    Control de corte de socios activos
                                </p>
                            </div>

                            {/* Filtros de Vencimiento */}
                            <div className="flex items-center gap-1 bg-black/60 p-1 rounded-2xl border border-zinc-800 text-[10px] font-black uppercase">
                                <button
                                    onClick={() => setExpirationFilter('all')}
                                    className={`px-3 py-1.5 rounded-xl transition-all ${
                                        expirationFilter === 'all'
                                            ? 'bg-orange-600 text-white shadow-md'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Todos
                                </button>
                                <button
                                    onClick={() => setExpirationFilter('today')}
                                    className={`px-3 py-1.5 rounded-xl transition-all ${
                                        expirationFilter === 'today'
                                            ? 'bg-orange-600 text-white shadow-md'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Hoy
                                </button>
                                <button
                                    onClick={() => setExpirationFilter('week')}
                                    className={`px-3 py-1.5 rounded-xl transition-all ${
                                        expirationFilter === 'week'
                                            ? 'bg-orange-600 text-white shadow-md'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    7 Días
                                </button>
                                <button
                                    onClick={() => setExpirationFilter('overdue')}
                                    className={`px-3 py-1.5 rounded-xl transition-all ${
                                        expirationFilter === 'overdue'
                                            ? 'bg-orange-600 text-white shadow-md'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Vencidos
                                </button>
                            </div>
                        </div>

                        {/* Lista de Vencimientos */}
                        <div className="flex-1 overflow-y-auto space-y-3 max-h-[460px] pr-1 custom-scroll">
                            {filteredExpiringList.length === 0 ? (
                                <div className="p-12 text-center bg-black/30 rounded-2xl border border-zinc-800/80">
                                    <ShieldCheck className="mx-auto text-emerald-500 mb-2" size={36} />
                                    <p className="text-xs font-black text-white uppercase tracking-widest">
                                        ¡Excelente! No hay vencimientos pendientes en este rango
                                    </p>
                                    <p className="text-[10px] text-zinc-500 font-bold mt-1">
                                        Todos los miembros correspondientes a este filtro se encuentran al día.
                                    </p>
                                </div>
                            ) : (
                                filteredExpiringList.slice(0, 10).map(m => {
                                    const formattedEndDate = m.end_date 
                                        ? format(new Date(m.end_date + 'T12:00:00'), "dd MMM", { locale: es }) 
                                        : 'N/A';

                                    let badgeColor = 'bg-zinc-800 text-zinc-300 border-zinc-700';
                                    let badgeText = `En ${m.daysRemaining} días`;

                                    if (m.isDueToday) {
                                        badgeColor = 'bg-red-600 text-white border-red-500 animate-pulse';
                                        badgeText = '¡VENCE HOY!';
                                    } else if (m.isOverdue) {
                                        badgeColor = 'bg-red-950/60 text-red-400 border-red-900/60';
                                        badgeText = `Venció hace ${Math.abs(m.daysRemaining)}d`;
                                    } else if (m.daysRemaining <= 3) {
                                        badgeColor = 'bg-amber-950/60 text-amber-400 border-amber-900/60';
                                        badgeText = `En ${m.daysRemaining} días`;
                                    }

                                    return (
                                        <div
                                            key={m.id}
                                            className="p-4 bg-black/60 hover:bg-black/90 border border-zinc-800 hover:border-zinc-700 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center font-black text-xs text-orange-500">
                                                    {m.customer_name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-white text-xs uppercase">
                                                            {m.customer_name}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${badgeColor}`}>
                                                            {badgeText}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold mt-0.5">
                                                        <span>{m.plan_name}</span>
                                                        <span>•</span>
                                                        <span>Corte: {formattedEndDate}</span>
                                                        {m.remaining > 0 && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="text-red-400 font-black">Deuda: ${m.remaining.toFixed(2)}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                                {m.phone && (
                                                    <button
                                                        onClick={() => handleSendWhatsApp(m)}
                                                        title="Contactar por WhatsApp"
                                                        className="p-2 bg-emerald-950/40 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-900/50 rounded-xl transition-all cursor-pointer"
                                                    >
                                                        <MessageCircle size={15} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setPaymentTarget(m)}
                                                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-md"
                                                >
                                                    <DollarSign size={13} /> Abonar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="pt-4 mt-auto border-t border-zinc-800 flex justify-between items-center text-[10px] font-bold text-zinc-500">
                            <span>Mostrando los vencimientos más relevantes</span>
                            <button
                                onClick={onOpenCalendar}
                                className="text-orange-500 hover:text-orange-400 font-black flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                            >
                                Abrir Calendario Completo <ArrowRight size={12} />
                            </button>
                        </div>

                    </div>
                </div>

                {/* COLUMNA DERECHA (5 COLS): FEED EN VIVO DE ÚLTIMOS PAGOS */}
                <div className="lg:col-span-5 space-y-4">
                    <div className="bg-zinc-900/90 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-7 shadow-2xl flex flex-col h-full">
                        
                        <div className="flex justify-between items-center mb-5">
                            <div>
                                <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                                    <Activity size={18} className="text-emerald-500" />
                                    Actividad Reciente de Pagos
                                </h3>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                                    Últimas transacciones registradas
                                </p>
                            </div>

                            <button
                                onClick={() => onNavigate('payments')}
                                className="text-[10px] font-black uppercase tracking-wider text-orange-500 hover:text-orange-400 cursor-pointer"
                            >
                                Ver todos
                            </button>
                        </div>

                        {/* Feed de Pagos */}
                        <div className="flex-1 overflow-y-auto space-y-3 max-h-[460px] pr-1 custom-scroll">
                            {recentPayments.length === 0 ? (
                                <div className="p-12 text-center bg-black/30 rounded-2xl border border-zinc-800/80">
                                    <DollarSign className="mx-auto text-zinc-600 mb-2" size={36} />
                                    <p className="text-xs font-black text-white uppercase tracking-widest">
                                        No hay pagos recientes registrados
                                    </p>
                                </div>
                            ) : (
                                recentPayments.map(p => {
                                    const badge = getMethodBadge(p.payment_method || '');
                                    const IconComponent = badge.icon;
                                    const pDate = p.created_at 
                                        ? format(new Date(p.created_at), "dd MMM • hh:mm a", { locale: es }) 
                                        : 'Reciente';

                                    return (
                                        <div
                                            key={p.id}
                                            className="p-3.5 bg-black/60 hover:bg-black/90 border border-zinc-800/90 rounded-2xl flex justify-between items-center transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl border ${badge.bg}`}>
                                                    <IconComponent size={16} />
                                                </div>
                                                <div>
                                                    <p className="font-black text-white text-xs uppercase tracking-tight truncate max-w-[160px] sm:max-w-[200px]">
                                                        {p.customer_name}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-500">
                                                        <span>{p.payment_method}</span>
                                                        {p.reference_number && (
                                                            <span>• Ref: {p.reference_number.substring(0, 8)}</span>
                                                        )}
                                                        <span>• {pDate}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="font-black text-emerald-400 text-sm">
                                                    +${p.amount.toFixed(2)}
                                                </div>
                                                {bcvRate > 0 && (
                                                    <div className="text-[10px] font-bold text-zinc-500">
                                                        Bs. {(p.amount * bcvRate).toFixed(2)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="pt-4 mt-auto border-t border-zinc-800 flex justify-between items-center text-[10px] font-bold text-zinc-500">
                            <span>Historial con Tasa BCV integrada</span>
                            <button
                                onClick={() => onNavigate('statistics')}
                                className="text-orange-500 hover:text-orange-400 font-black flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                            >
                                Ver Estadísticas <ArrowRight size={12} />
                            </button>
                        </div>

                    </div>
                </div>

            </div>

            {/* ==================================================================== */}
            {/* 6. DISTRIBUCIÓN DE PLANES & RESUMEN FINANCIERO                        */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Distribución por Plan */}
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-7 shadow-2xl space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                                <BarChart3 size={16} className="text-orange-500" />
                                Distribución de Membresías por Plan
                            </h3>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                                Preferencias de suscripción de los socios
                            </p>
                        </div>
                        <button
                            onClick={() => onNavigate('settings')}
                            className="text-[10px] font-black uppercase tracking-wider text-orange-500 hover:text-orange-400 cursor-pointer"
                        >
                            Configurar Planes
                        </button>
                    </div>

                    <div className="space-y-3 pt-2">
                        {planDistribution.length === 0 ? (
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider py-6 text-center">
                                No hay planes registrados
                            </p>
                        ) : (
                            planDistribution.map(p => (
                                <div key={p.name} className="p-3.5 bg-black/60 border border-zinc-800/80 rounded-2xl space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-black text-white uppercase">{p.name}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-zinc-400">{p.count} socios</span>
                                            <span className="font-black text-emerald-400">${p.revenue.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-gradient-to-r from-orange-600 to-amber-500 h-full rounded-full transition-all duration-700"
                                            style={{ width: `${p.percentage}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Resumen de Flujo de Caja del Mes */}
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-7 shadow-2xl space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                                <Wallet size={16} className="text-cyan-400" />
                                Flujo Financiero del Mes
                            </h3>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                                Balance de ingresos, inversiones y retiros
                            </p>
                        </div>
                        <button
                            onClick={() => onNavigate('financial')}
                            className="text-[10px] font-black uppercase tracking-wider text-orange-500 hover:text-orange-400 cursor-pointer"
                        >
                            Operaciones
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-4 bg-black/60 border border-zinc-800/80 rounded-2xl">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Total Ingresos</span>
                            <div className="text-xl font-black text-emerald-400 mt-1">
                                +${cashFlowSummary.totalInflow.toFixed(2)}
                            </div>
                            <span className="text-[9px] font-bold text-zinc-500">Membresías cobradas</span>
                        </div>

                        <div className="p-4 bg-black/60 border border-zinc-800/80 rounded-2xl">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Total Salidas</span>
                            <div className="text-xl font-black text-red-400 mt-1">
                                -${cashFlowSummary.totalOutflow.toFixed(2)}
                            </div>
                            <span className="text-[9px] font-bold text-zinc-500">Inversión & Retiros</span>
                        </div>
                    </div>

                    {/* Balance Neto */}
                    <div className="p-4 bg-black/80 border border-zinc-800 rounded-2xl flex justify-between items-center">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Balance Neto Disponible</span>
                            <div className={`text-2xl font-black ${cashFlowSummary.netFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ${cashFlowSummary.netFlow.toFixed(2)}
                            </div>
                        </div>

                        <div className="text-right">
                            {bcvRate > 0 && (
                                <div className="text-xs font-black text-zinc-300">
                                    Bs. {(cashFlowSummary.netFlow * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            )}
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Cierre en tiempo real</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* ==================================================================== */}
            {/* 7. MODAL DE PAGO DIRECTO DESDE EL DASHBOARD                         */}
            {/* ==================================================================== */}
            {paymentTarget && (
                <PaymentModal
                    id={paymentTarget.id}
                    orderTotal={paymentTarget.price}
                    customerName={paymentTarget.customer_name}
                    onClose={() => setPaymentTarget(null)}
                    onSuccess={() => {
                        setPaymentTarget(null);
                        setRefreshTrigger(prev => prev + 1);
                    }}
                />
            )}

        </div>
    );
}
export default InteractiveDashboard;
