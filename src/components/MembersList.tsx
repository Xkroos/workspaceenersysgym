import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { 
    Search, Loader2, DollarSign, Trash2, 
    CheckCircle2, UserX, Edit3, X, AlertCircle,
    UserCheck, UserMinus, RefreshCw, Star, ChevronDown, Users,
    ChevronLeft, ChevronRight
} from 'lucide-react';

// Componentes locales
import { PaymentModal } from './PaymentModal';
import MembershipForm from './MembershipForm';
import { RenewalModal } from './RenewalModal';

const PAGE_SIZE = 15; // 15 usuarios por página

export function MembersList({ refresh }: { refresh: boolean }) {
    const { user } = useAuth();
    
    // Estados de datos
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 200);
    const [activeTab, setActiveTab] = useState<'activo' | 'inactivo' | 'deudor' | 'entrenador' | 'todos'>('activo');
    const [currentPage, setCurrentPage] = useState(1);
    
    // Estados para el Menú Desplegable de Entrenadores
    const [showTrainerMenu, setShowTrainerMenu] = useState(false);
    const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);

    // Estados para Control de Modales
    const [paymentTarget, setPaymentTarget] = useState<any>(null);
    const [editTarget, setEditTarget] = useState<any>(null);
    const [renewalTarget, setRenewalTarget] = useState<any>(null);

    // Reset de página cuando cambia el filtro o la búsqueda
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, activeTab, selectedTrainer]);

    const fetchMembers = async () => {
        if (!user) return;
        setLoading(true);
        
        try {
            // Consulta en paralelo
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

            // OPTIMIZACIÓN O(N + M): Pre-indexar timestamps de miembros y pagos por membership_id
            const memberCreatedAtMap = new Map<string, number>();
            (membersRes.data || []).forEach(m => {
                memberCreatedAtMap.set(m.id, new Date(m.created_at).getTime());
            });

            const paymentsByMember = new Map<string, number>();
            if (paymentsRes.data) {
                for (let i = 0; i < paymentsRes.data.length; i++) {
                    const p = paymentsRes.data[i];
                    const memberCreatedTime = memberCreatedAtMap.get(p.membership_id);
                    if (memberCreatedTime !== undefined) {
                        const pTime = new Date(p.created_at).getTime();
                        if (pTime >= memberCreatedTime) {
                            const current = paymentsByMember.get(p.membership_id) || 0;
                            paymentsByMember.set(p.membership_id, current + Number(p.amount || 0));
                        }
                    }
                }
            }

            const processed = (membersRes.data || []).map(member => {
                const totalPaid = paymentsByMember.get(member.id) || 0;
                const planPrice = Number(member.price || 0);
                const remaining = planPrice - totalPaid;

                return { 
                    ...member, 
                    display_price: planPrice,
                    totalPaid,
                    remaining: remaining > 0 ? remaining : 0,
                    status_member: member.status_member || 'activo',
                    role: member.role || 'socio'
                };
            });

            setMembers(processed);
        } catch (err: any) {
            console.error("Error cargando datos:", err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchMembers(); 
    }, [user, refresh]);

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'activo' ? 'inactivo' : 'activo';
        const originalMembers = [...members];
        setMembers(prev => prev.map(m => m.id === id ? { ...m, status_member: newStatus } : m));

        try {
            const { error, data } = await supabase
                .from('memberships')
                .update({ status_member: newStatus })
                .eq('id', id)
                .select();

            if (error) throw error;
            if (!data || data.length === 0) throw new Error("RLS Check needed");
        } catch (error: any) {
            alert("Error: " + error.message);
            setMembers(originalMembers);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (window.confirm(`¿Estás seguro de eliminar a ${name}?`)) {
            const { error } = await supabase.from('memberships').delete().eq('id', id);
            if (!error) fetchMembers();
            else alert("Error al eliminar: " + error.message);
        }
    };

    const debtorsCount = useMemo(() => {
        return members.filter(m => m.remaining > 0).length;
    }, [members]);

    const trainersList = useMemo(() => {
        const list = members
            .map(m => m.trainer_name)
            .filter(name => name && name.trim() !== "");
        return Array.from(new Set(list));
    }, [members]);

    const filteredMembers = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase();
        return members.filter(m => {
            const matchesSearch = !term || 
                                 m.customer_name?.toLowerCase().includes(term) || 
                                 m.cedula?.includes(term);
            
            if (activeTab === 'entrenador') {
                const matchesSpecificTrainer = selectedTrainer ? m.trainer_name === selectedTrainer : true;
                return matchesSearch && matchesSpecificTrainer;
            }

            if (activeTab === 'deudor') {
                return matchesSearch && m.remaining > 0;
            }

            if (activeTab === 'todos') return matchesSearch;

            return matchesSearch && m.status_member === activeTab && m.role !== 'entrenador';
        });
    }, [debouncedSearch, members, activeTab, selectedTrainer]);

    // Paginación eficiente para mantener el DOM fluido
    const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
    const paginatedMembers = useMemo(() => {
        const startIdx = (currentPage - 1) * PAGE_SIZE;
        return filteredMembers.slice(startIdx, startIdx + PAGE_SIZE);
    }, [filteredMembers, currentPage]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <Loader2 className="animate-spin mb-4 text-orange-500" size={40} />
            <p className="font-black text-[10px] tracking-widest uppercase italic text-zinc-400">Sincronizando Miembros...</p>
        </div>
    );

    return (
        <div className="space-y-6 text-white">
            {/* TABS DE FILTRADO Y MENÚ DE ENTRENADORES */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex p-1 bg-black rounded-2xl w-fit border border-zinc-800">
                    <button 
                        onClick={() => { setActiveTab('activo'); setSelectedTrainer(null); }}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'activo' ? 'bg-zinc-900 text-orange-500 border border-zinc-800 shadow-lg shadow-orange-500/5' : 'text-zinc-500 hover:text-zinc-400'}`}
                    >
                        <UserCheck size={16} /> Activos
                    </button>
                    <button 
                        onClick={() => { setActiveTab('inactivo'); setSelectedTrainer(null); }}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'inactivo' ? 'bg-zinc-900 text-red-500 border border-zinc-800 shadow-lg' : 'text-zinc-500 hover:text-zinc-400'}`}
                    >
                        <UserMinus size={16} /> Inactivos
                    </button>
                    <button 
                        onClick={() => { setActiveTab('deudor'); setSelectedTrainer(null); }}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'deudor' ? 'bg-zinc-900 text-amber-500 border border-zinc-800 shadow-lg shadow-amber-500/5' : 'text-zinc-500 hover:text-zinc-400'}`}
                    >
                        <AlertCircle size={16} /> Deudores ({debtorsCount})
                    </button>
                    <button 
                        onClick={() => { setActiveTab('todos'); setSelectedTrainer(null); }}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'todos' ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-lg' : 'text-zinc-500 hover:text-zinc-400'}`}
                    >
                        <Users size={16} /> Todos ({members.length})
                    </button>
                </div>

                <div className="relative">
                    <button 
                        onClick={() => setShowTrainerMenu(!showTrainerMenu)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border shadow-sm ${activeTab === 'entrenador' ? 'bg-purple-600 text-white border-purple-600' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800/50'}`}
                    >
                        <Star size={16} /> {selectedTrainer || "Filtrar por Entrenador"} <ChevronDown size={14} className={`transition-transform ${showTrainerMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showTrainerMenu && (
                        <>
                            <div className="fixed inset-0 z-[65]" onClick={() => setShowTrainerMenu(false)}></div>
                            <div className="absolute top-full right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-[1.5rem] shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <button 
                                    onClick={() => { setActiveTab('entrenador'); setSelectedTrainer(null); setShowTrainerMenu(false); }}
                                    className="w-full text-left px-5 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800/50 text-zinc-400 border-b border-zinc-800"
                                >
                                    Ver alumnos de todos
                                </button>
                                <div className="max-h-60 overflow-y-auto custom-scroll">
                                    {trainersList.map(trainer => (
                                        <button 
                                            key={trainer}
                                            onClick={() => { setActiveTab('entrenador'); setSelectedTrainer(trainer); setShowTrainerMenu(false); }}
                                            className="w-full text-left px-5 py-3.5 text-[10px] font-black uppercase tracking-widest hover:bg-purple-950/20 text-zinc-400 flex items-center gap-2 transition-colors"
                                        >
                                            <div className="w-2 h-2 rounded-full bg-purple-500"></div> {trainer}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* BARRA DE BÚSQUEDA */}
            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar Miembro por nombre o cédula..." 
                    className="w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all font-bold text-sm text-white shadow-inner placeholder-zinc-700"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* RESUMEN DE REGISTROS */}
            <div className="flex justify-between items-center px-2 text-xs font-black text-zinc-500 uppercase tracking-widest">
                <span>Mostrando {filteredMembers.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0} - {Math.min(currentPage * PAGE_SIZE, filteredMembers.length)} de {filteredMembers.length} miembros</span>
                {totalPages > 1 && (
                    <span>Página {currentPage} de {totalPages}</span>
                )}
            </div>

            {/* TARJETAS DE Miembros */}
            <div className="grid grid-cols-1 gap-4">
                {paginatedMembers.length > 0 ? paginatedMembers.map((m) => (
                    <div key={m.id} className="bg-zinc-900 p-5 rounded-[2rem] border border-zinc-800/80 shadow-md hover:border-zinc-700 transition-all group animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            
                            {/* BLOQUE IZQUIERDO: AVATAR E IDENTIFICACIÓN */}
                            <div className="flex items-center gap-4 min-w-[220px]">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-14 h-14 rounded-2xl bg-black border border-zinc-800 flex items-center justify-center text-orange-500 font-black text-xl overflow-hidden shadow-inner">
                                        {m.photo_url ? (
                                            <img src={m.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        ) : (
                                            m.customer_name?.[0]?.toUpperCase() || 'M'
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => toggleStatus(m.id, m.status_member)}
                                        className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tight transition-all border ${m.status_member === 'activo' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30 hover:bg-emerald-900/40' : 'bg-red-950/40 text-red-400 border-red-900/30 hover:bg-red-900/40'}`}
                                    >
                                        {m.status_member}
                                    </button>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-black text-zinc-100 truncate text-sm uppercase tracking-tight">{m.customer_name}</h4>
                                    <p className="text-[10px] text-zinc-500 font-mono font-bold tracking-wider mt-0.5">{m.cedula}</p>
                                </div>
                            </div>

                            {/* BLOQUE CENTRAL: DATOS DE LA MEMBRESÍA */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider">Plan Contratado</span>
                                    <span className="text-xs font-black text-zinc-300 uppercase truncate mt-0.5">{m.plan_name || 'General'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-purple-500 uppercase font-black tracking-wider">Entrenador</span>
                                    <span className="text-xs font-black text-purple-400 uppercase truncate mt-0.5">
                                        {m.trainer_name || 'Sin asignar'}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-orange-500 uppercase font-black tracking-wider">Deuda Pendiente</span>
                                    <span className={`text-xs font-black mt-0.5 ${m.remaining > 0 ? 'text-orange-500' : 'text-emerald-400'}`}>
                                        ${m.remaining.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider">Estado Pago</span>
                                    <span className={`text-[9px] font-black uppercase flex items-center gap-1 mt-0.5 ${m.remaining === 0 ? 'text-emerald-400' : 'text-orange-500'}`}>
                                        {m.remaining === 0 ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} 
                                        {m.remaining === 0 ? 'Al día' : 'Deudor'}
                                    </span>
                                </div>
                            </div>

                            {/* BLOQUE DERECHO: ACCIONES */}
                            <div className="flex flex-wrap items-center gap-2 border-t lg:border-t-0 pt-4 lg:pt-0 border-zinc-800">
                                <button onClick={() => setRenewalTarget(m)} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 text-orange-500 rounded-xl text-[9px] font-black hover:bg-orange-600 hover:text-white transition-all uppercase tracking-widest border border-zinc-800 hover:border-transparent">
                                    <RefreshCw size={12} /> Renovar
                                </button>
                                <button 
                                    onClick={() => setPaymentTarget(m)} 
                                    disabled={m.remaining === 0}
                                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black hover:bg-emerald-700 transition-all uppercase tracking-widest shadow-lg shadow-emerald-600/10 border-b-2 border-emerald-800 disabled:bg-zinc-800 disabled:border-zinc-900 disabled:text-zinc-500 disabled:shadow-none"
                                >
                                    <DollarSign size={12} /> Pagar
                                </button>
                                <button onClick={() => setEditTarget(m)} className="p-2.5 bg-zinc-900 text-zinc-400 rounded-xl hover:bg-zinc-800 hover:text-white transition-all border border-zinc-800">
                                    <Edit3 size={16} />
                                </button>
                                <button onClick={() => handleDelete(m.id, m.customer_name)} className="p-2.5 text-zinc-600 hover:text-red-500 hover:bg-red-950/20 rounded-xl transition-all">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="py-20 text-center bg-zinc-900 rounded-[2.5rem] border-2 border-dashed border-zinc-800">
                        <UserX className="mx-auto text-zinc-700 mb-4" size={48} />
                        <h3 className="font-black text-zinc-400 uppercase text-xs tracking-wider">Sin registros en esta categoría</h3>
                    </div>
                )}
            </div>

            {/* CONTROLES DE PAGINACIÓN */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="flex items-center gap-2 px-4 py-2 bg-black border border-zinc-800 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-black"
                    >
                        <ChevronLeft size={16} /> Anterior
                    </button>
                    <span className="text-xs font-black text-orange-500 tracking-wider">
                        Página {currentPage} de {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="flex items-center gap-2 px-4 py-2 bg-black border border-zinc-800 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:hover:bg-black"
                    >
                        Siguiente <ChevronRight size={16} />
                    </button>
                </div>
            )}

            {/* MODALES CON BACKDROP MEJORADO */}
            {paymentTarget && <PaymentModal id={paymentTarget.id} orderTotal={paymentTarget.display_price} customerName={paymentTarget.customer_name} onClose={() => setPaymentTarget(null)} onSuccess={() => { setPaymentTarget(null); fetchMembers(); }} />}
            {renewalTarget && <RenewalModal member={renewalTarget} onClose={() => setRenewalTarget(null)} onSuccess={() => { setRenewalTarget(null); fetchMembers(); }} />}
            {editTarget && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <button onClick={() => setEditTarget(null)} className="absolute top-5 right-5 p-1.5 bg-black border border-zinc-800 rounded-xl text-zinc-500 hover:text-red-500 z-50 transition-colors"><X size={18}/></button>
                        <MembershipForm initialData={editTarget} onClose={() => setEditTarget(null)} onSuccess={() => { setEditTarget(null); fetchMembers(); }} />
                    </div>
                </div>
            )}
        </div>
    );
}