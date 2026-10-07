import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Calendar as CalendarIcon, X, ChevronLeft, ChevronRight,
    MessageCircle, Save, CheckCircle2,
    AlertCircle, Clock, DollarSign, User, Phone, RefreshCw, Info
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { PaymentModal } from './PaymentModal';

interface Membership {
    id: string;
    customer_name: string;
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

// Helper seguro para parsear fechas sin desfasajes de zona horaria
function parseDateSafe(dateVal: string | null | undefined): Date | null {
    if (!dateVal) return null;
    const clean = dateVal.split('T')[0].split(' ')[0].trim();
    const parts = clean.split('-');
    if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return new Date(y, m, d, 12, 0, 0);
        }
    }
    const parsed = new Date(dateVal);
    return isNaN(parsed.getTime()) ? null : parsed;
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
                                            ${event.is_paid ? event.price.toFixed(2) : (event.remaining || event.amount_due).toFixed(2)}
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

    const [msgToday, setMsgToday] = useState(DEFAULT_MSG_TODAY);
    const [msg3Days, setMsg3Days] = useState(DEFAULT_MSG_3DAYS);
    const [showSettings, setShowSettings] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);

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
        for (let i = startIdx; i > 0; i--) {
            days.push({ date: new Date(start.getFullYear(), start.getMonth(), 1 - i), isCurrent: false });
        }
        for (let i = 1; i <= end.getDate(); i++) {
            days.push({ date: new Date(start.getFullYear(), start.getMonth(), i), isCurrent: true });
        }
        while (days.length < 42) {
            days.push({ date: new Date(end.getFullYear(), end.getMonth(), days.length - (end.getDate() + startIdx) + 1), isCurrent: false });
        }
        return days;
    }, [currentDate]);

    // Agrupar eventos por fecha (yyyy-MM-dd)
    const groupedEvents = useMemo(() => {
        const acc: Record<string, DailyInfo> = {};
        const now = startOfDay(new Date());

        // 1. Pre-indexación de pagos por membership_id
        const memberCreatedAtMap = new Map<string, number>();
        memberships.forEach(m => {
            memberCreatedAtMap.set(m.id, new Date(m.created_at).getTime());
        });

        const paymentsByMember = new Map<string, number>();
        if (payments) {
            for (let i = 0; i < payments.length; i++) {
                const p = payments[i];
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

        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth();
        const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

        // 2. Mapear cada membresía a su fecha en el calendario
        memberships.forEach(m => {
            const dateStr = m.end_date || m.start_date || m.created_at;
            const dueDateParsed = parseDateSafe(dateStr);
            if (!dueDateParsed) return;

            const totalPaid = paymentsByMember.get(m.id) || 0;
            const price = Number(m.price || 0);
            const remaining = Math.max(0, price - totalPaid);
            const isPaid = remaining <= 0 || m.status_member === 'pagado';

            // Determinar el día del mes de corte
            const cutOffDay = dueDateParsed.getDate();
            const dayInCurrentMonth = Math.min(cutOffDay, daysInTargetMonth);
            const scheduledDate = new Date(targetYear, targetMonth, dayInCurrentMonth, 12, 0, 0);

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
                phone: m.phone,
                type: m.plan_name || m.type || 'Membresía',
                price,
                amount_due: remaining > 0 ? remaining : price,
                remaining,
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
                acc[key].totalDueToday += (remaining > 0 ? remaining : price);
            }
        });

        return acc;
    }, [memberships, payments, currentDate]);

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Totales del mes visible
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

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 md:p-6 pt-16 md:pt-20 pb-4 z-[100] animate-in fade-in">
            <div className="bg-zinc-900 text-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl max-h-[86vh] md:max-h-[85vh] flex flex-col overflow-hidden border border-zinc-800">
                
                {/* CABECERA */}
                <div className="p-5 md:p-6 bg-black border-b border-zinc-800 flex flex-wrap justify-between items-center gap-3 shrink-0">
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
                                Fechas de corte y estados de solvencia mensual
                            </p>
                        </div>
                    </div>

                    {/* Leyenda y Botones de Cabecera */}
                    <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        {/* Leyenda rápida */}
                        <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            <span className="flex items-center gap-1.5 text-emerald-400">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Pago ({monthStats.totalPaidCount})
                            </span>
                            <span className="flex items-center gap-1.5 text-red-400">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Pendiente ({monthStats.totalPendingCount})
                            </span>
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
                            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-black uppercase tracking-widest rounded-xl transition-all"
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
                        {/* BARRA DE NAVEGACIÓN ENTRE MESES */}
                        <div className="p-3 md:px-6 bg-zinc-950 flex justify-between items-center border-b border-zinc-800 shrink-0">
                            <button
                                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                                className="p-2 hover:bg-zinc-900 text-zinc-400 hover:text-white rounded-xl transition-all border border-zinc-850"
                                title="Mes anterior"
                            >
                                <ChevronLeft size={18} />
                            </button>

                            <div className="flex items-center gap-3">
                                <span className="font-black uppercase text-white tracking-widest text-sm md:text-base italic">
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

                        {/* CUADRÍCULA DEL CALENDARIO */}
                        <div className="flex-1 overflow-y-auto p-2 md:p-4 bg-zinc-950 custom-scroll flex flex-col">
                            {/* Días de la semana */}
                            <div className="grid grid-cols-7 gap-1 md:gap-1.5 mb-1.5 shrink-0">
                                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                                    <div
                                        key={d}
                                        className="py-1.5 text-center text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-black rounded-lg border border-zinc-800/80"
                                    >
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Celdas de los días */}
                            <div className="grid grid-cols-7 gap-1 md:gap-1.5 flex-1 min-h-[500px]">
                                {calendarDays.map((day, i) => {
                                    const key = format(day.date, 'yyyy-MM-dd');
                                    const data = groupedEvents[key];
                                    const isToday = key === todayStr;
                                    const hasEvents = Boolean(data && data.events.length > 0);

                                    return (
                                        <div
                                            key={i}
                                            onClick={() => data && data.events.length > 0 && setSelectedDayInfo(data)}
                                            className={`min-h-[85px] md:min-h-[105px] p-1.5 md:p-2 transition-all relative rounded-2xl border flex flex-col ${
                                                day.isCurrent
                                                    ? 'bg-zinc-900/90 border-zinc-800/80'
                                                    : 'opacity-35 bg-zinc-950 border-zinc-900/50'
                                            } ${
                                                hasEvents
                                                    ? 'cursor-pointer hover:border-zinc-650 hover:bg-zinc-850/90 shadow-sm'
                                                    : ''
                                            } ${
                                                isToday
                                                    ? 'border-orange-500/90 shadow-lg shadow-orange-500/10 ring-1 ring-orange-500/50'
                                                    : ''
                                            }`}
                                        >
                                            {/* Número de día */}
                                            <div className="flex justify-between items-center mb-1">
                                                {hasEvents ? (
                                                    <span className="text-[8px] font-black text-zinc-500 uppercase px-1 rounded bg-black">
                                                        {data.events.length}
                                                    </span>
                                                ) : <span />}

                                                <span
                                                    className={`text-[10px] font-black rounded-full flex items-center justify-center ${
                                                        isToday
                                                            ? 'w-5 h-5 bg-orange-500 text-black shadow-sm font-black'
                                                            : 'text-zinc-400'
                                                    }`}
                                                >
                                                    {day.date.getDate()}
                                                </span>
                                            </div>

                                            {/* CLIENTES EN EL CUADRO */}
                                            {hasEvents && (
                                                <div className="flex-1 space-y-1 overflow-hidden flex flex-col justify-start">
                                                    {data.events.slice(0, 3).map((event, idx) => (
                                                        <div
                                                            key={idx}
                                                            title={`${event.customer_name} - ${event.is_paid ? 'PAGO' : 'PENDIENTE'}`}
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

                                                    {data.events.length > 3 && (
                                                        <div className="text-[8px] font-black text-center text-zinc-400 bg-zinc-800/70 rounded py-0.5 uppercase tracking-wider">
                                                            +{data.events.length - 3} más
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
