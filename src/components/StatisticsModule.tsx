import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { 
    TrendingUp, DollarSign, ShoppingBag, X, UserX,
    Search, ChevronLeft, ChevronRight
} from 'lucide-react'; 
import { format, startOfDay, isBefore } from 'date-fns';
import { es } from 'date-fns/locale'; 

// ====================================================================
// INTERFACES
// ====================================================================

interface Membership {
    id: string;
    customer_name: string;
    phone?: string;
    plan_name: string;
    price: number;
    start_date: string;
    end_date: string;
    status_member: string;
    user_id: string;
}

interface Payment {
    id: string;
    membership_id: string;
    amount: number;
    amount_bs?: number;
    payment_method?: string;
    reference_number?: string;
    payment_date?: string;
    created_at?: string;
    customer_name?: string;
}

const PAGE_SIZE = 15; // 15 registros por página solicitado

// ====================================================================
// MODAL DE LISTA GENÉRICA
// ====================================================================

const ListModal = ({ title, items, type, onClose }: { title: string, items: any[], type: 'member' | 'payment' | 'debt', onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in">
            <div className="bg-zinc-900 rounded-[2.5rem] shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col border border-zinc-800">
                <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-black">
                    <h3 className="font-black text-white uppercase tracking-tighter text-sm">{title}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-xl transition-all"><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-3">
                    {items.length === 0 ? (
                        <p className="text-center text-slate-500 font-bold text-xs uppercase tracking-widest py-8">No hay registros</p>
                    ) : items.map((item, i) => (
                        <div key={i} className="p-4 bg-black border border-zinc-800 rounded-2xl flex justify-between items-center">
                            {type === 'member' && (
                                <>
                                    <div>
                                        <p className="font-black text-white text-sm uppercase">{item.customer_name}</p>
                                        <p className="text-[10px] font-bold text-zinc-500">{item.phone || 'Sin teléfono'}</p>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${item.status_member === 'activo' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50' : 'bg-red-950/40 text-red-400 border-red-900/50'}`}>
                                        {item.status_member === 'activo' ? 'AL DÍA' : 'PENDIENTE'}
                                    </span>
                                </>
                            )}
                            {type === 'payment' && (
                                <>
                                    <div>
                                        <p className="font-black text-white text-sm uppercase">{item.customer_name || `Pago #${item.id.substring(0,6)}`}</p>
                                        <p className="text-[10px] font-bold text-zinc-500">{item.created_at ? format(new Date(item.created_at), "dd MMM yyyy", { locale: es }) : 'N/A'}</p>
                                    </div>
                                    <p className="font-black text-emerald-500">${Number(item.amount).toFixed(2)}</p>
                                </>
                            )}
                            {type === 'debt' && (
                                <>
                                    <div>
                                        <p className="font-black text-white text-sm uppercase">{item.customer_name}</p>
                                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Pago Pendiente</p>
                                    </div>
                                    <p className="font-black text-red-500">Deuda: ${item.debt.toFixed(2)}</p>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export function StatisticsModule() {
    const { user } = useAuth();
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [activeList, setActiveList] = useState<'all' | 'inactive' | 'paid' | 'pending' | null>(null);
    const [loading, setLoading] = useState(true);

    // Estados para la nueva tabla de Historial de Pagos con Paginación de 15
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 200);
    const [currentPage, setCurrentPage] = useState(1);

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [memsRes, paysRes] = await Promise.all([
                supabase.from('memberships').select('*').eq('user_id', user.id),
                supabase.from('payments').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
            ]);

            setMemberships(memsRes.data || []);
            setPayments(paysRes.data || []);
        } catch (err) {
            console.error("Error cargando estadísticas:", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    // Resetear a página 1 cuando cambia la búsqueda
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    // Mapa de cliente por membership_id para lookup O(1)
    const memberNameMap = useMemo(() => {
        const map = new Map<string, string>();
        memberships.forEach(m => {
            map.set(m.id, m.customer_name);
        });
        return map;
    }, [memberships]);

    // Resumen estadístico
    const stats = useMemo(() => {
        const today = startOfDay(new Date());
        return memberships.reduce((acc, m) => {
            const price = Number(m.price) || 0;
            const paidForThis = payments.filter(p => p.membership_id === m.id).reduce((s, p) => s + Number(p.amount), 0);
            const isInactive = isBefore(new Date(m.end_date + 'T12:00:00'), today);
            const debt = price > paidForThis ? (price - paidForThis) : 0;
            return {
                count: acc.count + 1,
                paid: acc.paid + paidForThis, 
                pending: acc.pending + debt,   
                inactive: isInactive ? acc.inactive + 1 : acc.inactive
            };
        }, { count: 0, paid: 0, pending: 0, inactive: 0 });
    }, [memberships, payments]);

    // Lista unificada de pagos con nombre de cliente
    const allEnrichedPayments = useMemo(() => {
        return payments.map(p => ({
            ...p,
            customer_name: memberNameMap.get(p.membership_id) || 'Desconocido'
        }));
    }, [payments, memberNameMap]);

    // Filtrado de pagos por búsqueda
    const filteredPayments = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase();
        if (!term) return allEnrichedPayments;

        return allEnrichedPayments.filter(p => {
            const matchesCustomer = p.customer_name?.toLowerCase().includes(term);
            const matchesMethod = p.payment_method?.toLowerCase().includes(term);
            const matchesRef = p.reference_number?.toLowerCase().includes(term);
            return matchesCustomer || matchesMethod || matchesRef;
        });
    }, [allEnrichedPayments, debouncedSearch]);

    // Paginación a 15 registros por página
    const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
    const paginatedPayments = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredPayments.slice(start, start + PAGE_SIZE);
    }, [filteredPayments, currentPage]);

    return (
        <div className="space-y-6 text-white animate-in fade-in duration-500">
            {/* Cabecera */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900 p-6 rounded-[2.5rem] border border-zinc-800 shadow-xl">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Estadísticas & Pagos</h2>
                    <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">Métricas globales y registro histórico</p>
                </div>
            </div>

            {/* Tarjetas de Métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={<ShoppingBag size={20}/>} color="orange" label="Miembros Inscritos" value={stats.count} onClick={() => setActiveList('all')} />
                <StatCard icon={<UserX size={20}/>} color="red" label="Inactivos" value={stats.inactive} subtext="Vencidos" onClick={() => setActiveList('inactive')} />
                <StatCard icon={<TrendingUp size={20}/>} color="green" label="Caja Total" value={`$${stats.paid.toFixed(2)}`} onClick={() => setActiveList('paid')} />
                <StatCard icon={<DollarSign size={20}/>} color="yellow" label="Pendiente" value={`$${stats.pending.toFixed(2)}`} onClick={() => setActiveList('pending')} />
            </div>

            {/* ==================================================================== */}
            {/* NUEVA INTEGRACIÓN: HISTORIAL DE PAGOS DE CLIENTES (15 POR PÁGINA)   */}
            {/* ==================================================================== */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] shadow-2xl overflow-hidden mt-6">
                
                {/* Cabecera de la Tabla y Buscador */}
                <div className="p-6 bg-black border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="font-black text-white text-sm uppercase tracking-widest flex items-center gap-2 italic">
                            <DollarSign className="w-5 h-5 text-emerald-500" /> Historial de Pagos de Clientes
                        </h3>
                        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mt-0.5">
                            Mostrando 15 registros por página
                        </p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-72">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                            <input 
                                type="text"
                                placeholder="Buscar cliente, método o ref..."
                                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 text-xs font-bold text-white shadow-inner placeholder-zinc-600"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-3 py-2 rounded-xl uppercase tracking-widest whitespace-nowrap">
                            {filteredPayments.length} Pagos
                        </span>
                    </div>
                </div>

                {/* Tabla de Pagos */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                            <tr className="text-[10px] font-black uppercase tracking-wider">
                                <th className="p-4 pl-8">Cliente (Origen)</th>
                                <th className="p-4 text-center">Método</th>
                                <th className="p-4 text-center">Referencia</th>
                                <th className="p-4 text-right">Monto (USD)</th>
                                <th className="p-4 text-right">Monto (Bs)</th>
                                <th className="p-4 pr-8 text-center">Fecha</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 font-sans">
                            {paginatedPayments.map((p, idx) => (
                                <tr key={p.id || idx} className="hover:bg-zinc-950/50 transition-colors">
                                    <td className="p-4 pl-8">
                                        <p className="font-bold text-zinc-100 uppercase tracking-tight">{p.customer_name}</p>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-[9px] px-2.5 py-1 rounded-md font-black uppercase tracking-wide border bg-zinc-950 text-zinc-300 border-zinc-800">
                                            {p.payment_method || 'N/A'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center font-mono text-xs text-zinc-400">
                                        {p.reference_number || '---'}
                                    </td>
                                    <td className="p-4 text-right font-black text-base text-emerald-400">
                                        ${Number(p.amount || 0).toLocaleString()}
                                    </td>
                                    <td className="p-4 text-right font-black text-sm text-zinc-400">
                                        {p.amount_bs ? `Bs. ${Number(p.amount_bs).toLocaleString()}` : '---'}
                                    </td>
                                    <td className="p-4 pr-8 text-center text-zinc-400 text-xs font-bold">
                                        {new Date(p.created_at || p.payment_date || '').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </td>
                                </tr>
                            ))}
                            {paginatedPayments.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-zinc-500 font-bold text-xs uppercase tracking-widest">
                                        {loading ? "Cargando registros..." : "No hay pagos registrados."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Controles de Paginación (15 por Página) */}
                <div className="p-4 bg-black border-t border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">
                        Mostrando {filteredPayments.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0} - {Math.min(currentPage * PAGE_SIZE, filteredPayments.length)} de {filteredPayments.length} registros
                    </span>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900"
                        >
                            <ChevronLeft size={16} /> Anterior
                        </button>

                        <span className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-black text-orange-500 tracking-wider">
                            {currentPage} / {totalPages}
                        </span>

                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900"
                        >
                            Siguiente <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

            </div>

            {/* Modales de Tarjetas */}
            {activeList === 'all' && (
                <ListModal 
                    title="Miembros Inscritos" 
                    items={memberships} 
                    type="member" 
                    onClose={() => setActiveList(null)} 
                />
            )}
            {activeList === 'inactive' && (
                <ListModal 
                    title="Miembros Inactivos" 
                    items={memberships.filter(m => isBefore(new Date(m.end_date + 'T12:00:00'), startOfDay(new Date())))} 
                    type="member" 
                    onClose={() => setActiveList(null)} 
                />
            )}
            {activeList === 'paid' && (
                <ListModal 
                    title="Ingresos Registrados (Caja)" 
                    items={allEnrichedPayments} 
                    type="payment" 
                    onClose={() => setActiveList(null)} 
                />
            )}
            {activeList === 'pending' && (
                <ListModal 
                    title="Cuentas por Cobrar" 
                    items={memberships.map(m => {
                        const price = Number(m.price) || 0;
                        const paid = payments.filter(p => p.membership_id === m.id).reduce((s, p) => s + Number(p.amount), 0);
                        return { ...m, debt: price > paid ? (price - paid) : 0 };
                    }).filter(m => m.debt > 0)} 
                    type="debt" 
                    onClose={() => setActiveList(null)} 
                />
            )}
        </div>
    );
}

function StatCard({ icon, color, label, value, bs, subtext, onClick }: any) {
    const colors: any = { 
        orange: 'bg-orange-950/40 text-orange-500 border-orange-500', 
        red: 'bg-red-950/40 text-red-500 border-red-500', 
        green: 'bg-emerald-950/40 text-emerald-500 border-emerald-500', 
        yellow: 'bg-yellow-950/40 text-yellow-500 border-yellow-500' 
    };

    return (
        <div 
            onClick={onClick}
            className={`bg-zinc-900 border-zinc-800 rounded-[2rem] p-6 shadow-xl border-b-4 border-l border-t border-r ${colors[color].split(' ')[2]} ${onClick ? 'cursor-pointer hover:scale-[1.02] hover:bg-zinc-800/80 transition-all' : ''}`}
        >
            <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl ${colors[color].split(' ')[0]} ${colors[color].split(' ')[1]}`}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <p className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em]">{label}</p>
                        {subtext && (
                            <span className="text-[8px] font-bold text-red-400 uppercase tracking-widest bg-red-950/40 px-2 py-0.5 rounded-full border border-red-900/30">
                                {subtext}
                            </span>
                        )}
                    </div>
                    <p className="text-2xl font-black text-white truncate tracking-tighter mt-1">{value}</p>
                    {bs !== null && bs !== undefined && (
                        <p className="text-[10px] text-zinc-600 mt-1 font-bold">Bs. {bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                    )}
                </div>
            </div>
        </div>
    );
}