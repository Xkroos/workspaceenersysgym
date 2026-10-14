import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Calendar as CalendarIcon, X, ChevronLeft, ChevronRight,
    MessageCircle, Save, CheckCircle2,
    AlertCircle, Clock, DollarSign, User, Phone, RefreshCw, Info,
    Search
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { PaymentModal } from './PaymentModal';
import { useDebounce } from '../hooks/useDebounce';

interface Membership {
    id: string;
    customer_name: string;
    cedula?: string;
    phone?: string;
    plan_name?: string;
    type?: string;
    price: number;
    start_date: string;
    end_date: string;
    status_member: string;
    user_id: string;
    created_at: string;
    photo_url?: string;
}

export interface CalendarEvent {
    id: string;
    membership_id: string;
    customer_name: string;
    cedula?: string;
    phone?: string;
    type: string;
    price: number;
    amount_due: number;
    remaining: number;
    total_paid: number;
    is_paid: boolean;
    is_overdue: boolean;
    date: Date;
    days_left: number;
    photo_url?: string;
}

interface DailyInfo {
    date: Date;
    events: CalendarEvent[];
    totalPaidToday: number;
    totalDueToday: number;
}

const DEFAULT_MSG_TODAY = 'Hola {nombre}, te saludamos de la administración de Energym Fitness Center 🏋️‍♂️💪. Te recordamos que hoy te toca cancelar tu mensualidad del plan {plan}. El monto pendiente es de ${monto}. ¡Te esperamos!';
const DEFAULT_MSG_3DAYS = 'Hola {nombre}, te saludamos de la administración de Energym Fitness Center 🏋️‍♂️💪. Te recordamos que te faltan 3 días por cancelar tu membresía del plan {plan}. El monto será de ${monto}. ¡Te esperamos!';

// Helper robusto para parsear fechas sin desfasajes de zona horaria y soportando múltiples formatos
function parseDateSafe(dateVal: string | null | undefined): Date | null {
    if (!dateVal) return null;
    const trimmed = String(dateVal).trim();
    if (!trimmed) return null;

    // Extraer solo la parte de la fecha (remover hora T... o espacio ...)
    const clean = trimmed.split('T')[0].split(' ')[0].trim();

    // Soporte para delimitadores '-' y '/'
    const delimiter = clean.includes('-') ? '-' : clean.includes('/') ? '/' : null;
    if (delimiter) {
        const parts = clean.split(delimiter);
        if (parts.length === 3) {
            const p0 = parseInt(parts[0], 10);
            const p1 = parseInt(parts[1], 10);
            const p2 = parseInt(parts[2], 10);

            // Formato estándar YYYY-MM-DD o YYYY/MM/DD
            if (parts[0].length === 4 && !isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
                return new Date(p0, p1 - 1, p2, 12, 0, 0);
            }
            // Formato latinoamericano DD-MM-YYYY o DD/MM/YYYY
            if (parts[2].length === 4 && !isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
                return new Date(p2, p1 - 1, p0, 12, 0, 0);
            }
        }
    }

    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
}

// Obtener el día de corte asegurando que ningún cliente registrado se pierda
function getMemberCutOffDay(m: Membership, daysInMonth: number): number {
    const candidates = [m.end_date, m.start_date, m.created_at];
    for (const val of candidates) {
        if (!val) continue;
        const parsed = parseDateSafe(val);
        if (parsed && !isNaN(parsed.getTime())) {
            const day = parsed.getDate();
            if (day >= 1 && day <= 31) {
                return Math.min(day, daysInMonth);
            }
        }
    }
    // Fallback: Si no tiene fecha válida, ubicarlo en el día 1 o fecha actual del mes para no omitirlo
    const fallbackDay = Math.min(new Date().getDate(), daysInMonth);
    return Math.max(1, fallbackDay);
}

// Verifica si un miembro está marcado como Inactivo
function isMemberInactive(m: Membership): boolean {
    const statusMember = m.status_member ? String(m.status_member).trim().toLowerCase() : '';
    const status = (m as any).status ? String((m as any).status).trim().toLowerCase() : '';
    return statusMember === 'inactivo' || status === 'inactivo';
}

// Verifica si el registro pertenece a un rol de entrenador
function isTrainerRole(m: Membership): boolean {
    const role = (m as any).role ? String((m as any).role).trim().toLowerCase() : '';
    return role === 'entrenador';
}

// Modal de Detalles del Día
const DayDetailsModal: React.FC<{
    dailyInfo: DailyInfo;
    onClose: () => void;
    msgToday: string;
    msg3Days: string;
    onPaymentSuccess: () => void;
}> = ({ dailyInfo, onClose, msgToday, msg3Days, onPaymentSuccess }) => {
    const [paymentTarget, setPaymentTarget] = useState<CalendarEvent | null>(null);

    const handleWhatsApp = (event: CalendarEvent) => {
        if (!event.phone || event.phone.trim() === '') {
            alert(`No hay un número de teléfono registrado para ${event.customer_name}.`);
            return;
        }

        let cleanPhone = event.phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '58' + cleanPhone.substring(1);
        } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('58')) {
            cleanPhone = '58' + cleanPhone;
        }

        let messageText = '';
        if (event.is_paid) {
            messageText = `Hola *${event.customer_name}*, te saludamos de *Energym Fitness Center* 🏋️‍♂️💪. Te confirmamos que tu membresía del plan *${event.type}* se encuentra solvente y al día (Estado: PAGO). ¡Agradecemos tu compromiso y seguimos entrenando juntos! 🥊⚡`;
        } else {
            const rawMessage = event.days_left > 0 ? msg3Days : msgToday;
            const amountToShow = event.remaining > 0 ? event.remaining : event.amount_due;
            messageText = rawMessage
                .replace(/{nombre}/g, event.customer_name)
                .replace(/{plan}/g, event.type)
                .replace(/{monto}/g, amountToShow.toFixed(2));
        }

        const message = encodeURIComponent(messageText);
        window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${message}`, '_blank');
    };

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[110] animate-in fade-in">
            <div className="bg-zinc-900 rounded-[2.5rem] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-zinc-800 text-white">
                
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-black">
                    <div>
                        <h3 className="font-black text-white uppercase tracking-tighter text-sm sm:text-base italic">
                            Clientes del Día
                        </h3>
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                            {format(dailyInfo.date, "EEEE, d 'de' MMMM, yyyy", { locale: es })}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Resumen del día */}
                <div className="grid grid-cols-3 gap-2 p-4 bg-zinc-950 border-b border-zinc-800 text-center">
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Clientes</p>
                        <p className="text-xl font-black text-white">{dailyInfo.events.length}</p>
                    </div>
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Pagados</p>
                        <p className="text-xl font-black text-emerald-400">
                            {dailyInfo.events.filter(e => e.is_paid).length}
                        </p>
                    </div>
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Pendientes</p>
                        <p className="text-xl font-black text-red-400">
                            {dailyInfo.events.filter(e => !e.is_paid).length}
                        </p>
                    </div>
                </div>

                {/* Lista de clientes */}
                <div className="p-5 overflow-y-auto space-y-3 custom-scroll flex-1">
                    {dailyInfo.events.map((event, i) => {
                        const hasPhone = Boolean(event.phone && event.phone.trim() !== '');

                        return (
                            <div
                                key={i}
                                className={`p-4 rounded-2xl border transition-all ${
                                    event.is_paid
                                        ? 'bg-emerald-950/20 border-emerald-900/40'
                                        : event.is_overdue
                                        ? 'bg-red-950/20 border-red-900/40'
                                        : 'bg-zinc-950 border-zinc-800'
                                }`}
                            >
                                <div className="flex justify-between items-start gap-2 mb-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-orange-500">
                                            {event.photo_url ? (
                                                <img src={event.photo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                                            ) : (
                                                <User size={16} />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <span className="font-black text-white text-sm uppercase truncate block">
                                                {event.customer_name}
                                            </span>
                                            <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-bold flex-wrap">
                                                <span>Plan: {event.type}</span>
                                                {event.cedula && (
                                                    <span className="text-zinc-400">
                                                        • C.I: <span className="text-zinc-300 font-mono">{event.cedula}</span>
                                                    </span>
                                                )}
                                                {event.phone && (
                                                    <span className="flex items-center gap-1 text-zinc-500">
                                                        <Phone size={10} className="text-zinc-400" /> {event.phone}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Estado */}
                                    {event.is_paid ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 shrink-0">
                                            <CheckCircle2 size={12} /> Pago
                                        </span>
                                    ) : event.is_overdue ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-red-950/60 text-red-400 border border-red-900/60 shrink-0">
                                            <AlertCircle size={12} /> Pendiente
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-950/60 text-amber-400 border border-amber-900/60 shrink-0">
                                            <Clock size={12} /> Por Cobrar
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 mt-2">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                            {event.is_paid ? 'Monto Pagado' : 'Monto Pendiente'}
                                        </span>
                                        <span className={`text-base font-black ${event.is_paid ? 'text-emerald-400' : 'text-red-400'}`}>
                                            ${event.is_paid ? event.price.toFixed(2) : event.remaining.toFixed(2)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {!event.is_paid && (
                                            <button
                                                onClick={() => setPaymentTarget(event)}
                                                className="flex items-center gap-1 px-3 py-2 bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                            >
                                                <DollarSign size={13} /> Abonar
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleWhatsApp(event)}
                                            disabled={!hasPhone}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md ${
                                                hasPhone
                                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-95'
                                                    : 'bg-zinc-800 text-zinc-600 border border-zinc-700/50 cursor-not-allowed'
                                            }`}
                                        >
                                            <MessageCircle size={14} />
                                            <span>{event.is_paid ? 'Mensaje' : (event.days_left > 0 ? 'Avisar' : 'Cobrar')}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal de Abono Directo */}
            {paymentTarget && (
                <PaymentModal
                    id={paymentTarget.membership_id}
                    orderTotal={paymentTarget.price}
                    customerName={paymentTarget.customer_name}
                    onClose={() => setPaymentTarget(null)}
                    onSuccess={() => {
                        setPaymentTarget(null);
                        onPaymentSuccess();
                    }}
                />
            )}
        </div>
    );
};

export const CalendarModule: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const { user } = useAuth();
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDayInfo, setSelectedDayInfo] = useState<DailyInfo | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending'>('all');

    // Búsqueda de clientes por nombre o cédula
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 200);

    const [msgToday, setMsgToday] = useState(DEFAULT_MSG_TODAY);
    const [msg3Days, setMsg3Days] = useState(DEFAULT_MSG_3DAYS);
    const [showSettings, setShowSettings] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Carga de membresías y pagos
    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [memRes, payRes] = await Promise.all([
                supabase
                    .from('memberships')
                    .select('*')
                    .eq('user_id', user.id),
                supabase
                    .from('payments')
                    .select('membership_id, amount, created_at')
                    .eq('user_id', user.id)
            ]);

            setMemberships(memRes.data || []);
            setPayments(payRes.data || []);

            // Mensajes configurados
            const { data: settingsData } = await supabase
                .from('settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (settingsData) {
                if (settingsData.message_today) setMsgToday(settingsData.message_today);
                if (settingsData.message_three_days) setMsg3Days(settingsData.message_three_days);
            }
        } catch (err) {
            console.warn("Aviso al cargar datos del calendario:", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Resetear el scroll al cambiar de mes
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [currentDate]);

    const handleSaveConfig = async () => {
        if (!user) return;
        setSavingConfig(true);
        try {
            const { data: existing } = await supabase
                .from('settings')
                .select('id')
                .eq('user_id', user.id)
                .single();

            if (existing) {
                await supabase
                    .from('settings')
                    .update({ message_today: msgToday, message_three_days: msg3Days })
                    .eq('user_id', user.id);
            } else {
                await supabase
                    .from('settings')
                    .insert([{ user_id: user.id, message_today: msgToday, message_three_days: msg3Days }]);
            }
            alert("Mensajes guardados con éxito.");
            setShowSettings(false);
        } catch (err: any) {
            alert("Error guardando los mensajes: " + err.message);
        } finally {
            setSavingConfig(false);
        }
    };

    // Generar días del mes para la cuadrícula (Lunes a Domingo)
    const calendarDays = useMemo(() => {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const days = [];
        const startIdx = start.getDay() === 0 ? 6 : start.getDay() - 1;

        // Días de relleno del mes anterior
        for (let i = startIdx; i > 0; i--) {
            days.push({
                date: new Date(start.getFullYear(), start.getMonth(), 1 - i),
                isCurrent: false
            });
        }

        // Días del mes en curso
        for (let i = 1; i <= end.getDate(); i++) {
            days.push({
                date: new Date(start.getFullYear(), start.getMonth(), i),
                isCurrent: true
            });
        }

        // Días de relleno del mes siguiente (garantizando 42 celdas exactas sin duplicar el mes actual)
        let nextMonthDay = 1;
        while (days.length < 42) {
            days.push({
                date: new Date(start.getFullYear(), start.getMonth() + 1, nextMonthDay++),
                isCurrent: false
            });
        }
        return days;
    }, [currentDate]);

    // Agrupar eventos por fecha (yyyy-MM-dd)
    const groupedEvents = useMemo(() => {
        const acc: Record<string, DailyInfo> = {};
        const now = startOfDay(new Date());

        // 1. Pre-indexación de timestamps de membresías
        const memberCreatedAtMap = new Map<string, number>();
        memberships.forEach(m => {
            if (m.created_at) {
                const t = new Date(m.created_at).getTime();
                if (!isNaN(t)) {
                    memberCreatedAtMap.set(m.id, t);
                }
            }
        });

        // 2. Pre-indexación de pagos por membership_id con tolerancia de reloj
        const paymentsByMember = new Map<string, number>();
        if (payments && payments.length > 0) {
            for (let i = 0; i < payments.length; i++) {
                const p = payments[i];
                if (!p.membership_id) continue;
                const memTime = memberCreatedAtMap.get(p.membership_id);
                if (memTime !== undefined) {
                    const pTime = p.created_at ? new Date(p.created_at).getTime() : NaN;
                    // Tolerancia de 60s por desfase de reloj entre cliente y servidor Supabase
                    if (isNaN(pTime) || pTime >= memTime - 60000) {
                        const cur = paymentsByMember.get(p.membership_id) || 0;
                        paymentsByMember.set(p.membership_id, cur + Number(p.amount || 0));
                    }
                } else {
                    const cur = paymentsByMember.get(p.membership_id) || 0;
                    paymentsByMember.set(p.membership_id, cur + Number(p.amount || 0));
                }
            }
        }

        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth();
        const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

        // 3. Mapear cada cliente activo a su fecha de corte en el calendario
        memberships.forEach(m => {
            // REQUISITO CRÍTICO 1: Las personas con status Inactivo NO deben aparecer en el calendario
            if (isMemberInactive(m) || isTrainerRole(m)) {
                return;
            }

            // REQUISITO CRÍTICO 2: Asegurar que TODOS los clientes registrados con estatus Pagado y Pendiente aparezcan
            const cutOffDay = getMemberCutOffDay(m, daysInTargetMonth);
            const scheduledDate = new Date(targetYear, targetMonth, cutOffDay, 12, 0, 0);

            const totalPaid = paymentsByMember.get(m.id) || 0;
            const price = Number(m.price || 0);
            const remaining = Math.max(0, price - totalPaid);

            const statusMemberClean = m.status_member ? String(m.status_member).trim().toLowerCase() : '';
            const statusClean = (m as any).status ? String((m as any).status).trim().toLowerCase() : '';

            const isExplicitlyPaid = statusMemberClean === 'pagado' || statusClean === 'pagado';

            // ALINEACIÓN TOTAL CON REGISTRO: Si el saldo pendiente es 0 (o menor), el miembro está AL DÍA / PAGO
            const isPaid = remaining <= 0 || isExplicitlyPaid;

            const key = format(scheduledDate, 'yyyy-MM-dd');
            if (!acc[key]) {
                acc[key] = { date: scheduledDate, events: [], totalPaidToday: 0, totalDueToday: 0 };
            }

            const diffTime = scheduledDate.getTime() - now.getTime();
            const daysLeft = Math.round(diffTime / (1000 * 3600 * 24));
            const isOverdue = !isPaid && daysLeft < 0;

            const eventItem: CalendarEvent = {
                id: m.id,
                membership_id: m.id,
                customer_name: m.customer_name || 'Sin nombre',
                cedula: m.cedula,
                phone: m.phone,
                type: m.plan_name || m.type || 'Membresía',
                price,
                amount_due: isPaid ? 0 : remaining,
                remaining: isPaid ? 0 : remaining,
                total_paid: totalPaid,
                is_paid: isPaid,
                is_overdue: isOverdue,
                date: scheduledDate,
                days_left: daysLeft,
                photo_url: m.photo_url
            };

            acc[key].events.push(eventItem);
            if (isPaid) {
                acc[key].totalPaidToday += price;
            } else {
                acc[key].totalDueToday += remaining;
            }
        });

        return acc;
    }, [memberships, payments, currentDate]);

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Totales del mes visible (Solo clientes activos, Pagados y Pendientes)
    const monthStats = useMemo(() => {
        let totalEvents = 0;
        let totalPaidCount = 0;
        let totalPendingCount = 0;

        Object.values(groupedEvents).forEach(day => {
            day.events.forEach(e => {
                totalEvents++;
                if (e.is_paid) totalPaidCount++;
                else totalPendingCount++;
            });
        });

        return { totalEvents, totalPaidCount, totalPendingCount };
    }, [groupedEvents]);

    // Conteo de resultados de búsqueda por nombre o cédula
    const searchResultsCount = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase();
        if (!term) return null;
        let count = 0;
        Object.values(groupedEvents).forEach(day => {
            day.events.forEach(e => {
                const matchesSearch =
                    e.customer_name?.toLowerCase().includes(term) ||
                    Boolean(e.cedula && String(e.cedula).toLowerCase().includes(term));
                const matchesStatus =
                    filterStatus === 'all' ? true :
                    filterStatus === 'paid' ? e.is_paid :
                    !e.is_paid;
                if (matchesSearch && matchesStatus) count++;
            });
        });
        return count;
    }, [groupedEvents, debouncedSearch, filterStatus]);

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 pt-14 md:pt-16 pb-3 z-[100] animate-in fade-in">
            <div className="bg-zinc-900 text-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden border border-zinc-800">
                
                {/* CABECERA */}
                <div className="p-4 sm:p-5 bg-black border-b border-zinc-800 flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-2xl">
                            <CalendarIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg md:text-xl font-black uppercase tracking-tighter italic">
                                    Calendario de Pagos
                                </h2>
                                <span className="bg-zinc-800 text-zinc-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border border-zinc-700">
                                    {monthStats.totalEvents} {monthStats.totalEvents === 1 ? 'cliente' : 'clientes'}
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                Fechas de corte y solvencia de clientes activos
                            </p>
                        </div>
                    </div>

                    {/* Filtros de Estado y Botones de Cabecera */}
                    <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        {/* Selector interactivo de filtro: Todos / Pago / Pendiente */}
                        <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            <button
                                onClick={() => setFilterStatus('all')}
                                title="Mostrar todos los clientes activos"
                                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                                    filterStatus === 'all'
                                        ? 'bg-zinc-800 text-white shadow-sm'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                                Todos ({monthStats.totalEvents})
                            </button>
                            <button
                                onClick={() => setFilterStatus('paid')}
                                title="Filtrar solo clientes con estatus Pagado"
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
                                    filterStatus === 'paid'
                                        ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 shadow-sm'
                                        : 'text-emerald-400 hover:text-emerald-300'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Pago ({monthStats.totalPaidCount})
                            </button>
                            <button
                                onClick={() => setFilterStatus('pending')}
                                title="Filtrar solo clientes con estatus Pendiente"
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
                                    filterStatus === 'pending'
                                        ? 'bg-red-950/90 text-red-300 border border-red-700/60 shadow-sm'
                                        : 'text-red-400 hover:text-red-300'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Pendiente ({monthStats.totalPendingCount})
                            </button>
                        </div>

                        <button
                            onClick={loadData}
                            disabled={loading}
                            title="Refrescar datos"
                            className="p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl transition-all disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin text-orange-500" : ""} />
                        </button>

                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="px-3 sm:px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-black uppercase tracking-widest rounded-xl transition-all"
                        >
                            {showSettings ? 'Ver Calendario' : 'Plantillas WhatsApp'}
                        </button>

                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-2.5 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 rounded-xl transition-all"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {showSettings ? (
                    <div className="p-6 md:p-8 flex-1 overflow-auto bg-zinc-950 custom-scroll">
                        <h3 className="text-base font-black uppercase text-white mb-4 italic">
                            Configuración de Mensajes WhatsApp
                        </h3>

                        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 mb-6 flex gap-3 text-xs text-zinc-300">
                            <Info className="shrink-0 text-orange-500" />
                            <div>
                                <p className="font-black text-orange-500 uppercase tracking-wider mb-1">Variables Dinámicas:</p>
                                <p>Puedes usar <code className="text-orange-400 bg-black px-1.5 py-0.5 rounded font-mono font-bold">{`{nombre}`}</code>, <code className="text-orange-400 bg-black px-1.5 py-0.5 rounded font-mono font-bold">{`{plan}`}</code> y <code className="text-orange-400 bg-black px-1.5 py-0.5 rounded font-mono font-bold">{`{monto}`}</code>. Se sustituirán con los datos reales del socio al pulsar enviar.</p>
                            </div>
                        </div>

                        <div className="space-y-5 max-w-2xl">
                            <div>
                                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                                    Mensaje: Día de Pago (Hoy o Vencido)
                                </label>
                                <textarea
                                    className="w-full p-4 bg-black border border-zinc-800 rounded-2xl h-28 text-xs font-medium text-white outline-none focus:border-orange-500 transition-colors custom-scroll"
                                    value={msgToday}
                                    onChange={(e) => setMsgToday(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                                    Mensaje: Recordatorio Previo (Faltan 3 días)
                                </label>
                                <textarea
                                    className="w-full p-4 bg-black border border-zinc-800 rounded-2xl h-28 text-xs font-medium text-white outline-none focus:border-orange-500 transition-colors custom-scroll"
                                    value={msg3Days}
                                    onChange={(e) => setMsg3Days(e.target.value)}
                                />
                            </div>

                            <button
                                onClick={handleSaveConfig}
                                disabled={savingConfig}
                                className="px-6 py-3.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-orange-600/20 cursor-pointer"
                            >
                                <Save size={16} /> {savingConfig ? 'Guardando...' : 'Guardar Mensajes'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* BARRA DE NAVEGACIÓN ENTRE MESES Y BÚSQUEDA */}
                        <div className="p-2 sm:px-6 bg-zinc-950 flex flex-wrap justify-between items-center gap-2.5 border-b border-zinc-800 shrink-0">
                            {/* Navegación de Mes */}
                            <div className="flex items-center gap-2 sm:gap-3">
                                <button
                                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                                    className="p-2 hover:bg-zinc-900 text-zinc-400 hover:text-white rounded-xl transition-all border border-zinc-850"
                                    title="Mes anterior"
                                >
                                    <ChevronLeft size={18} />
                                </button>

                                <div className="flex items-center gap-2.5">
                                    <span className="font-black uppercase text-white tracking-widest text-sm sm:text-base italic">
                                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                                    </span>
                                    <button
                                        onClick={() => setCurrentDate(new Date())}
                                        className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-zinc-900 text-orange-500 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-all"
                                    >
                                        Hoy
                                    </button>
                                </div>

                                <button
                                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                                    className="p-2 hover:bg-zinc-900 text-zinc-400 hover:text-white rounded-xl transition-all border border-zinc-850"
                                    title="Mes siguiente"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>

                            {/* BARRA DE BÚSQUEDA POR NOMBRE O CÉDULA */}
                            <div className="flex items-center gap-2 flex-1 sm:flex-initial w-full sm:w-auto justify-end">
                                {searchResultsCount !== null && (
                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                                        searchResultsCount > 0
                                            ? 'bg-orange-950/40 text-orange-400 border-orange-500/30'
                                            : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                                    }`}>
                                        {searchResultsCount} {searchResultsCount === 1 ? 'resultado' : 'resultados'}
                                    </span>
                                )}

                                <div className="relative w-full sm:w-64 md:w-80 group">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-orange-500 transition-colors pointer-events-none" size={15} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o cédula..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full pl-9 pr-8 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-white placeholder-zinc-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 transition-all shadow-inner"
                                    />
                                    {search && (
                                        <button
                                            onClick={() => setSearch('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5 rounded-md hover:bg-zinc-800 transition-all cursor-pointer"
                                            title="Limpiar búsqueda"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CUADRÍCULA DEL CALENDARIO */}
                        <div 
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto p-2 sm:p-3 bg-zinc-950 custom-scroll flex flex-col min-h-0"
                        >
                            {/* Días de la semana */}
                            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 shrink-0">
                                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                                    <div
                                        key={d}
                                        className="py-1 text-center text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-black rounded-lg border border-zinc-800/80"
                                    >
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Celdas de los días */}
                            <div className="grid grid-cols-7 grid-rows-6 gap-1 sm:gap-1.5 flex-1 min-h-[460px]">
                                {calendarDays.map((day, i) => {
                                    const key = format(day.date, 'yyyy-MM-dd');
                                    const data = groupedEvents[key];
                                    const isToday = key === todayStr;

                                    const isSearchActive = Boolean(debouncedSearch.trim());
                                    const term = debouncedSearch.trim().toLowerCase();

                                    // Filtrar eventos visibles según filtro de estatus y término de búsqueda
                                    const allDayEvents = (day.isCurrent && data ? data.events : []);
                                    const visibleEvents = allDayEvents.filter(e => {
                                        // Filtro de estatus (Todos / Pago / Pendiente)
                                        if (filterStatus === 'paid' && !e.is_paid) return false;
                                        if (filterStatus === 'pending' && e.is_paid) return false;

                                        // Filtro por nombre o cédula
                                        if (isSearchActive) {
                                            const matchesName = e.customer_name?.toLowerCase().includes(term);
                                            const matchesCedula = e.cedula && String(e.cedula).toLowerCase().includes(term);
                                            if (!matchesName && !matchesCedula) return false;
                                        }

                                        return true;
                                    });

                                    const hasVisibleEvents = visibleEvents.length > 0;
                                    const isHighlighted = isSearchActive && hasVisibleEvents;

                                    return (
                                        <div
                                            key={i}
                                            onClick={() => day.isCurrent && hasVisibleEvents && data && setSelectedDayInfo({ ...data, events: visibleEvents })}
                                            className={`min-h-[64px] sm:min-h-[72px] md:min-h-0 p-1 sm:p-1.5 transition-all relative rounded-xl sm:rounded-2xl border flex flex-col ${
                                                day.isCurrent
                                                    ? isHighlighted
                                                        ? 'bg-orange-950/40 border-orange-500 ring-2 ring-orange-500/50 shadow-lg shadow-orange-500/20'
                                                        : isSearchActive
                                                        ? 'opacity-30 bg-zinc-950 border-zinc-900/60'
                                                        : 'bg-zinc-900/90 border-zinc-800/80'
                                                    : 'opacity-20 bg-zinc-950 border-zinc-900/40 pointer-events-none'
                                            } ${
                                                day.isCurrent && hasVisibleEvents
                                                    ? 'cursor-pointer hover:border-zinc-650 hover:bg-zinc-850/90 shadow-sm'
                                                    : ''
                                            } ${
                                                isToday && day.isCurrent && !isHighlighted
                                                    ? 'border-orange-500/90 shadow-lg shadow-orange-500/10 ring-1 ring-orange-500/50'
                                                    : ''
                                            }`}
                                        >
                                            {/* Número de día y contador de eventos */}
                                            <div className="flex justify-between items-center mb-1">
                                                {hasVisibleEvents ? (
                                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded-md border ${
                                                        isHighlighted
                                                            ? 'bg-orange-600 text-white border-orange-500'
                                                            : 'bg-zinc-950 text-orange-400 border-zinc-800'
                                                    }`}>
                                                        {visibleEvents.length}
                                                    </span>
                                                ) : <span />}

                                                <span
                                                    className={`text-[10px] font-black rounded-full flex items-center justify-center ${
                                                        isToday && day.isCurrent
                                                            ? 'w-5 h-5 bg-orange-500 text-black shadow-sm font-black'
                                                            : day.isCurrent ? 'text-zinc-400' : 'text-zinc-600'
                                                    }`}
                                                >
                                                    {day.date.getDate()}
                                                </span>
                                            </div>

                                            {/* CLIENTES EN EL CUADRO */}
                                            {hasVisibleEvents && (
                                                <div className="flex-1 space-y-1 overflow-hidden flex flex-col justify-start">
                                                    {visibleEvents.slice(0, 3).map((event, idx) => (
                                                        <div
                                                            key={idx}
                                                            title={`${event.customer_name}${event.cedula ? ` (C.I: ${event.cedula})` : ''} - ${event.is_paid ? 'PAGO' : 'PENDIENTE'}`}
                                                            className={`p-1 rounded-md text-[9px] font-black flex items-center justify-between gap-1 transition-all ${
                                                                event.is_paid
                                                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                                                    : event.is_overdue
                                                                    ? 'bg-red-950/80 text-red-300 border border-red-500/30'
                                                                    : 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-1 min-w-0 flex-1">
                                                                {event.is_paid ? (
                                                                    <CheckCircle2 size={9} className="text-emerald-400 shrink-0" />
                                                                ) : (
                                                                    <AlertCircle size={9} className="text-amber-400 shrink-0" />
                                                                )}
                                                                <span className="truncate leading-none">
                                                                    {event.customer_name}
                                                                </span>
                                                            </div>

                                                            <span
                                                                className={`text-[7px] uppercase px-1 py-0.2 rounded font-black shrink-0 ${
                                                                    event.is_paid
                                                                        ? 'bg-emerald-800/80 text-emerald-100'
                                                                        : 'bg-red-800/80 text-red-100'
                                                                }`}
                                                            >
                                                                {event.is_paid ? 'Pago' : `$${event.amount_due}`}
                                                            </span>
                                                        </div>
                                                    ))}

                                                    {visibleEvents.length > 3 && (
                                                        <div className="text-[8px] font-black text-center text-zinc-400 bg-zinc-800/70 rounded py-0.5 uppercase tracking-wider">
                                                            +{visibleEvents.length - 3} más
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Modal de Detalle al pulsar un día */}
            {selectedDayInfo && (
                <DayDetailsModal
                    dailyInfo={selectedDayInfo}
                    onClose={() => setSelectedDayInfo(null)}
                    msgToday={msgToday}
                    msg3Days={msg3Days}
                    onPaymentSuccess={() => {
                        loadData();
                        setSelectedDayInfo(null);
                    }}
                />
            )}
        </div>
    );
};
