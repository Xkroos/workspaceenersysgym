import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DollarSign, TrendingUp, Zap, Clock, Loader2, Download, Filter, Search, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportFinancialReportPDF } from '../lib/pdfExport';

const MOVEMENTS_PAGE_SIZE = 5;

// Interfaces para tipado de datos con propiedades temporales de Supabase incluidas
interface MembershipWithPayments {
    id: string;
    customer_name: string;
    price: number; 
    status: string;
    user_id: string;
    created_at: string; // Agregado para el filtro temporal
    payments: any[];
}

export function FinancialOperationsModule() {
    const { user } = useAuth();
    const [memberships, setMemberships] = useState<MembershipWithPayments[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Estados de filtrado
    const [filterPeriod, setFilterPeriod] = useState<'Todos' | 'Diario' | 'Semanal' | 'Mensual' | 'Anual' | 'Personalizado' | 'Mes Actual'>('Mes Actual');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [filterMethod, setFilterMethod] = useState('Todos');
    const [filterMember, setFilterMember] = useState('');
    const [movementsPage, setMovementsPage] = useState(1);
    
    // Estados para Modal de Operación
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [transactionType, setTransactionType] = useState<'ingreso' | 'inversion' | 'retiro'>('ingreso');
    const [transactionAmount, setTransactionAmount] = useState('');
    const [transactionDesc, setTransactionDesc] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const loadFinancialData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            // 1. Cargar Transacciones, Membresías y Pagos en paralelo
            const [transRes, memRes, payRes] = await Promise.all([
                supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('transaction_date', { ascending: false }),
                supabase
                    .from('memberships')
                    .select('*')
                    .eq('user_id', user.id),
                supabase
                    .from('payments')
                    .select('*')
                    .eq('user_id', user.id)
            ]);

            // 2. Procesar Membresías y unir con sus pagos
            if (memRes.data) {
                const processed = memRes.data.map((m: any) => {
                    const relatedPayments = payRes.data 
                        ? payRes.data.filter(p => p.membership_id === m.id) 
                        : [];
                    
                    return {
                        ...m,
                        price: Number(m.price) || 0,
                        payments: relatedPayments
                    };
                });
                setMemberships(processed);
            }

            // 3. Procesar Transacciones (Gastos y Retiros)
            if (transRes.data) {
                setTransactions(transRes.data);
            }

        } catch (err) {
            console.error("Error crítico en carga financiera:", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadFinancialData();
    }, [loadFinancialData]);

    // Unificar todos los pagos para facilitar el filtrado
    const allPayments = useMemo(() => {
        const flat: any[] = [];
        memberships.forEach(m => {
            m.payments.forEach(p => {
                flat.push({ ...p, customer_name: m.customer_name });
            });
        });
        return flat;
    }, [memberships]);

    const getStartDateForPeriod = (period: string) => {
        const now = new Date();
        switch (period) {
            case 'Diario': now.setHours(0,0,0,0); return now;
            case 'Semanal': now.setDate(now.getDate() - 7); return now;
            case 'Mensual': now.setMonth(now.getMonth() - 1); return now;
            case 'Anual': now.setFullYear(now.getFullYear() - 1); return now;
            case 'Mes Actual': 
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                return firstDay;
            default: return new Date(0);
        }
    };

    // Aplicar Filtros a Pagos
    const filteredPayments = useMemo(() => {
        let filtered = allPayments;

        if (filterPeriod !== 'Todos') {
            let start = new Date(0);
            let end = new Date();
            
            if (filterPeriod === 'Personalizado') {
                start = customStartDate ? new Date(customStartDate + 'T00:00:00') : new Date(0);
                end = customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date();
            } else {
                start = getStartDateForPeriod(filterPeriod);
            }

            filtered = filtered.filter(p => {
                const pDate = new Date(p.created_at || p.payment_date);
                return pDate >= start && pDate <= end;
            });
        }

        if (filterMethod !== 'Todos') {
            filtered = filtered.filter(p => p.payment_method?.toLowerCase() === filterMethod.toLowerCase());
        }

        if (filterMember.trim() !== '') {
            filtered = filtered.filter(p => p.customer_name?.toLowerCase().includes(filterMember.toLowerCase()));
        }

        return filtered;
    }, [allPayments, filterPeriod, customStartDate, customEndDate, filterMethod, filterMember]);

    // Aplicar Filtros a Transacciones
    const filteredTransactions = useMemo(() => {
        let filtered = transactions;
        if (filterPeriod !== 'Todos') {
            let start = new Date(0);
            let end = new Date();
            if (filterPeriod === 'Personalizado') {
                start = customStartDate ? new Date(customStartDate + 'T00:00:00') : new Date(0);
                end = customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date();
            } else {
                start = getStartDateForPeriod(filterPeriod);
            }

            filtered = filtered.filter(t => {
                const tDate = new Date(t.transaction_date);
                return tDate >= start && tDate <= end;
            });
        }
        return filtered;
    }, [transactions, filterPeriod, customStartDate, customEndDate]);

    // Resetear página de movimientos al cambiar filtros
    useEffect(() => {
        setMovementsPage(1);
    }, [filterPeriod, customStartDate, customEndDate, filterMember]);

    // Paginación a 5 registros por página para movimientos
    const totalMovementPages = Math.max(1, Math.ceil(filteredTransactions.length / MOVEMENTS_PAGE_SIZE));
    const paginatedTransactions = useMemo(() => {
        const start = (movementsPage - 1) * MOVEMENTS_PAGE_SIZE;
        return filteredTransactions.slice(start, start + MOVEMENTS_PAGE_SIZE);
    }, [filteredTransactions, movementsPage]);

    // Cálculos de estadísticas filtradas
    const periodPaid = useMemo(() => filteredPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0), [filteredPayments]);
    const periodPaidBs = useMemo(() => filteredPayments.reduce((acc, p) => acc + (Number(p.amount_bs) || 0), 0), [filteredPayments]);
    const periodInvested = useMemo(() => filteredTransactions.filter(t => t.type === 'inversion').reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [filteredTransactions]);
    const periodWithdrawn = useMemo(() => filteredTransactions.filter(t => t.type === 'retiro').reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [filteredTransactions]);
    const periodIngresoManual = useMemo(() => filteredTransactions.filter(t => t.type === 'ingreso').reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [filteredTransactions]);
    const periodNetCashFlow = periodPaid + periodIngresoManual - periodInvested - periodWithdrawn;

    // Cuentas por cobrar globales (se ven afectadas por el filtro de miembro)
    const stats = useMemo(() => {
        return memberships
            .filter(mem => filterMember.trim() === '' || mem.customer_name?.toLowerCase().includes(filterMember.toLowerCase()))
            .reduce((acc, mem) => {
                const paid = mem.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                const salePrice = Number(mem.price) || 0;
                const balance = salePrice - paid;
                return {
                    totalPending: acc.totalPending + (balance > 0 ? balance : 0),
                };
            }, { totalPending: 0 });
    }, [memberships, filterMember]);

    const [generatingPdf, setGeneratingPdf] = useState(false);

    // --- GENERACIÓN DE PDF CON FILTRADO ACTUAL (Carga diferida bajo demanda) ---
    const generatePDF = async () => {
        if (generatingPdf) return;
        try {
            setGeneratingPdf(true);
            await exportFinancialReportPDF({
                filterPeriod,
                customStartDate,
                customEndDate,
                periodPaid,
                periodPaidBs,
                periodIngresoManual,
                totalPending: stats.totalPending,
                periodInvested,
                periodWithdrawn,
                periodNetCashFlow,
                filteredTransactions,
                filteredPayments
            });
        } catch (err) {
            console.error("Error generando PDF:", err);
            alert("Error al generar el reporte financiero en PDF.");
        } finally {
            setGeneratingPdf(false);
        }
    };

    const handleTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isProcessing) return;
        const amount = parseFloat(transactionAmount);

        if (isNaN(amount) || amount <= 0 || !transactionDesc.trim()) return;

        const actionText = transactionType === 'ingreso' ? 'ingresar' : transactionType === 'inversion' ? 'invertir' : 'retirar/gastar';
        if (!window.confirm(`¿Estás seguro que deseas ${actionText} la cantidad de $${amount}?`)) return;

        setIsProcessing(true);
        try {
            await supabase.from('financial_transactions').insert({
                user_id: user.id,
                amount,
                type: transactionType,
                description: transactionDesc.trim(),
                transaction_date: new Date().toISOString()
            });

            setTransactionAmount('');
            setTransactionDesc('');
            setIsTransactionModalOpen(false);
            
            await loadFinancialData();
        } catch (error) {
            console.error("Error al registrar transacción:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    // Ajuste de colores para la gráfica de Energym
    const chartData = [
        { label: 'Caja Real', value: periodNetCashFlow > 0 ? periodNetCashFlow : 0, color: '#10b981' }, 
        { label: 'Ingreso Manual', value: periodIngresoManual, color: '#3b82f6' },
        { label: 'Inversión', value: periodInvested, color: '#f97316' },                  
        { label: 'Retiros', value: periodWithdrawn, color: '#ef4444' },                         
        { label: 'Por Cobrar', value: stats.totalPending, color: '#a1a1aa' }              
    ].filter(d => d.value > 0);

    const totalVal = chartData.reduce((s, i) => s + i.value, 0) || 1;

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="animate-spin text-orange-500" size={40} />
            <p className="text-zinc-500 text-[10px] uppercase font-black tracking-widest animate-pulse">Sincronizando finanzas...</p>
        </div>
    );

    return (
        <div className="p-4 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500 text-white">
            
            {/* CABECERA Y FILTROS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 p-6 rounded-[2.5rem] border border-zinc-800 shadow-2xl">
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Panel Financiero</h2>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gestión y Filtros Avanzados</p>
                </div>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <button onClick={() => setIsTransactionModalOpen(true)} className="flex-1 md:flex-none flex justify-center items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all border-b-2 border-emerald-800">
                        <Plus size={16} /> Nueva Operación
                    </button>
                    <button 
                        onClick={generatePDF} 
                        disabled={generatingPdf}
                        className="flex-1 md:flex-none flex justify-center items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-orange-700 shadow-lg shadow-orange-600/20 transition-all border-b-2 border-orange-800 disabled:opacity-50"
                    >
                        <Download size={16} className={generatingPdf ? "animate-bounce" : ""} /> 
                        {generatingPdf ? "Generando PDF..." : "Exportar PDF"}
                    </button>
                </div>
            </div>

            {/* SECCIÓN DE FILTROS */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2.5rem] shadow-xl">
                <div className="flex items-center gap-2 mb-5">
                    <Filter className="w-4 h-4 text-orange-500" />
                    <h3 className="font-black text-zinc-300 text-xs uppercase tracking-widest">Filtros Activos</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Período */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Período</label>
                        <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value as any)} className="w-full p-3.5 bg-black border border-zinc-800 rounded-xl text-sm font-bold text-white outline-none focus:border-orange-500 transition-colors">
                            <option value="Todos">Todos (Histórico)</option>
                            <option value="Diario">Hoy</option>
                            <option value="Semanal">Últimos 7 días</option>
                            <option value="Mes Actual">Mes Actual</option>
                            <option value="Mensual">Últimos 30 días</option>
                            <option value="Anual">Último Año</option>
                            <option value="Personalizado">Rango Personalizado</option>
                        </select>
                    </div>

                    {filterPeriod === 'Personalizado' && (
                        <div className="space-y-1.5 lg:col-span-2 flex gap-3 animate-in fade-in slide-in-from-left-2">
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Desde</label>
                                <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="w-full p-3.5 bg-black border border-zinc-800 rounded-xl text-sm font-bold text-white outline-none focus:border-orange-500 transition-colors" />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Hasta</label>
                                <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="w-full p-3.5 bg-black border border-zinc-800 rounded-xl text-sm font-bold text-white outline-none focus:border-orange-500 transition-colors" />
                            </div>
                        </div>
                    )}

                    {/* Método de Pago */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Método de Pago</label>
                        <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="w-full p-3.5 bg-black border border-zinc-800 rounded-xl text-sm font-bold text-white outline-none focus:border-orange-500 transition-colors">
                            <option value="Todos">Todos</option>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Divisas">Divisas</option>
                            <option value="Pago movil">Pago Móvil</option>
                            <option value="Zelle">Zelle</option>
                        </select>
                    </div>

                    {/* Miembro */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Buscar Miembro / Origen</label>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                            <input type="text" placeholder="Escriba un nombre..." value={filterMember} onChange={e => setFilterMember(e.target.value)} className="w-full pl-10 pr-4 py-3.5 bg-black border border-zinc-800 rounded-xl text-sm font-bold text-white outline-none focus:border-orange-500 transition-colors" />
                        </div>
                    </div>
                </div>
            </div>

            {/* EFECTIVO NETO */}
            <div className={`bg-zinc-900 border-l-8 rounded-[2.5rem] p-8 shadow-2xl border border-zinc-800 ${periodNetCashFlow >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-2xl ${periodNetCashFlow >= 0 ? 'bg-emerald-950/40 text-emerald-400' : 'bg-red-950/40 text-red-400'}`}>
                        <Zap className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Efectivo Real en Caja</p>
                        <p className="text-4xl font-black tracking-tighter italic text-white">${periodNetCashFlow.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 border-b-4 border-b-emerald-500 shadow-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="w-4 h-4 text-emerald-500" /> 
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Ingresos (Pagos)</span>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-white">${periodPaid.toLocaleString()}</p>
                </div>
                
                <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 border-b-4 border-b-indigo-500 shadow-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-4 h-4 text-indigo-500" /> 
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Inversiones</span>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-white">${periodInvested.toLocaleString()}</p>
                </div>

                <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 border-b-4 border-b-red-500 shadow-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-red-500" /> 
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Gastos / Retiros</span>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-white">${periodWithdrawn.toLocaleString()}</p>
                </div>
                
                <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 border-b-4 border-b-orange-500 shadow-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-orange-500" /> 
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Por Cobrar (Global)</span>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-white">${stats.totalPending.toLocaleString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="p-5 bg-black border-b border-zinc-800 flex justify-between items-center">
                        <h3 className="font-black text-white text-xs uppercase tracking-widest flex items-center gap-2 italic">
                            <Clock className="w-4 h-4 text-orange-500" /> Historial de Movimientos
                        </h3>
                        <span className="text-[10px] font-black text-orange-400 bg-orange-950/40 border border-orange-900/50 px-3 py-1 rounded-full uppercase tracking-widest">
                            {filteredTransactions.length} Movimientos (5 por pág)
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-zinc-950 text-zinc-500 border-b border-zinc-800 sticky top-0 z-0">
                                <tr className="text-[10px] font-black uppercase tracking-wider">
                                    <th className="p-4 pl-8">Concepto</th>
                                    <th className="p-4 text-right">Monto</th>
                                    <th className="p-4 pr-8 text-center">Fecha</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60">
                                {paginatedTransactions.map(t => (
                                    <tr key={t.id} className="hover:bg-zinc-950/40 transition-colors">
                                        <td className="p-4 pl-8">
                                            <p className="font-bold text-zinc-200">{t.description}</p>
                                            <span className={`text-[8px] px-2 py-0.5 rounded font-black uppercase tracking-wide border ${t.type === 'ingreso' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30' : t.type === 'inversion' ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/30' : 'bg-red-950/40 text-red-400 border-red-900/30'}`}>
                                                {t.type}
                                            </span>
                                        </td>
                                        <td className={`p-4 text-right font-black text-base ${t.type === 'ingreso' ? 'text-emerald-500' : t.type === 'inversion' ? 'text-indigo-500' : 'text-red-500'}`}>
                                            ${Number(t.amount).toLocaleString()}
                                        </td>
                                        <td className="p-4 pr-8 text-center text-zinc-500 text-[10px] font-bold">
                                            {new Date(t.transaction_date).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                                {paginatedTransactions.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="p-8 text-center text-zinc-500 font-bold text-xs uppercase tracking-widest">
                                            No hay movimientos registrados en este período.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Controles de paginación para movimientos (5 por página) */}
                    <div className="p-3 bg-black border-t border-zinc-800 flex justify-between items-center text-xs font-black">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest pl-4">
                            {filteredTransactions.length > 0 ? (movementsPage - 1) * MOVEMENTS_PAGE_SIZE + 1 : 0} - {Math.min(movementsPage * MOVEMENTS_PAGE_SIZE, filteredTransactions.length)} de {filteredTransactions.length}
                        </span>
                        <div className="flex items-center gap-2 pr-4">
                            <button
                                onClick={() => setMovementsPage(p => Math.max(1, p - 1))}
                                disabled={movementsPage === 1}
                                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="text-[10px] px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-orange-500">
                                {movementsPage} / {totalMovementPages}
                            </span>
                            <button
                                onClick={() => setMovementsPage(p => Math.min(totalMovementPages, p + 1))}
                                disabled={movementsPage === totalMovementPages}
                                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* GRÁFICO CIRCULAR */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] shadow-2xl p-6 flex flex-col items-center justify-center">
                    <h3 className="font-black text-white text-xs uppercase tracking-widest mb-8 w-full text-left italic">Distribución</h3>
                    <div className="relative w-44 h-44 mb-8" style={{ 
                        background: `conic-gradient(${chartData.map((d, i) => {
                            const start = chartData.slice(0, i).reduce((sum, curr) => sum + (curr.value / totalVal) * 100, 0);
                            const end = start + (d.value / totalVal) * 100;
                            return `${d.color} ${start}% ${end}%`;
                        }).join(', ')})`,
                        borderRadius: '50%'
                    }}>
                        <div className="absolute inset-6 bg-zinc-900 rounded-full flex flex-col items-center justify-center border border-zinc-800/80 shadow-2xl">
                            <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Caja</span>
                            <span className="text-lg font-black text-white tracking-tight">${periodNetCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                    <div className="w-full space-y-2">
                        {chartData.map(item => (
                            <div key={item.label} className="flex justify-between items-center text-[10px] p-3 bg-black rounded-xl border border-zinc-800/80">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="font-black text-zinc-400 uppercase tracking-wide">{item.label}</span>
                                </div>
                                <span className="font-black text-white">${item.value.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MODAL DE REGISTRO DE TRANSACCIÓN MANUAL */}
            {isTransactionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 w-full max-w-md rounded-[2.5rem] border border-zinc-800 shadow-2xl overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-black">
                            <div>
                                <h2 className="font-black text-white uppercase tracking-tighter text-lg">Registrar Operación</h2>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest italic">Inversiones o Gastos Manuales</p>
                            </div>
                            <button onClick={() => setIsTransactionModalOpen(false)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleTransaction} className="p-8 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1 mb-2 block">Tipo de Operación</label>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => setTransactionType('ingreso')} 
                                            className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${transactionType === 'ingreso' ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500' : 'bg-black text-zinc-500 border border-zinc-800'}`}
                                        >
                                            Ingreso
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => setTransactionType('inversion')} 
                                            className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${transactionType === 'inversion' ? 'bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500' : 'bg-black text-zinc-500 border border-zinc-800'}`}
                                        >
                                            Inversión
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => setTransactionType('retiro')} 
                                            className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${transactionType === 'retiro' ? 'bg-red-500/20 text-red-400 border-2 border-red-500' : 'bg-black text-zinc-500 border border-zinc-800'}`}
                                        >
                                            Retiro
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">Monto (USD)</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                        <input 
                                            type="number" step="0.01" placeholder="0.00" required
                                            value={transactionAmount} onChange={(e) => setTransactionAmount(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3.5 bg-black border border-zinc-800 rounded-xl font-bold text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">Descripción / Concepto</label>
                                    <input 
                                        type="text" placeholder="Ej. Pago de luz, Compra de equipo..." required
                                        value={transactionDesc} onChange={(e) => setTransactionDesc(e.target.value)}
                                        className="w-full px-4 py-3.5 bg-black border border-zinc-800 rounded-xl font-bold text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                                    />
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isProcessing}
                                className={`w-full py-4 text-white rounded-2xl font-black hover:opacity-90 disabled:opacity-50 transition-all shadow-xl uppercase text-xs tracking-widest border-b-2 ${transactionType === 'ingreso' ? 'bg-emerald-600 border-emerald-800' : transactionType === 'inversion' ? 'bg-indigo-600 border-indigo-800' : 'bg-red-600 border-red-800'}`}
                            >
                                {isProcessing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Guardar Operación'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}