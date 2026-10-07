import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../hooks/useDebounce';
import { 
  Search, 
  User, 
  CreditCard, 
  ChevronRight, 
  Loader2,
  Calendar,
  Activity,
  X,
  Phone,
  Fingerprint,
  ChevronLeft
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CustomerDetails } from './CustomerDetails';

const PAGE_SIZE = 18;

export function PaymentsModule() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 200);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [inspectCustomer, setInspectCustomer] = useState<any | null>(null);
    const [allPayments, setAllPayments] = useState<any[]>([]);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        fetchCustomers();
    }, []);

    // Resetear a la página 1 cuando cambia la búsqueda
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const [memRes, payRes] = await Promise.all([
                supabase
                    .from('memberships')
                    .select('*')
                    .order('customer_name', { ascending: true }),
                supabase
                    .from('payments')
                    .select('membership_id, reference_number')
            ]);

            if (memRes.error) throw memRes.error;
            setCustomers(memRes.data || []);
            setAllPayments(payRes.data || []);
        } catch (err) {
            console.error("Error cargando Miembro:", err);
        } finally {
            setLoading(false);
        }
    };

    // Función auxiliar para formatear el vencimiento en tiempo real
    const getExpirationDate = (customer: any) => {
        if (customer.end_date) {
            return format(new Date(customer.end_date + 'T12:00:00'), "dd MMM, yyyy", { locale: es });
        }
        if (customer.created_at) {
            const registrationDate = new Date(customer.created_at);
            const calculatedExpiration = addDays(registrationDate, 30);
            return format(calculatedExpiration, "dd MMM, yyyy", { locale: es });
        }
        return 'No registrada';
    };

    // Pre-indexar referencias de pago en un Map para búsqueda instantánea O(1)
    const referencesByMember = useMemo(() => {
        const map = new Map<string, string[]>();
        allPayments.forEach(p => {
            if (!p.reference_number || !p.membership_id) return;
            const list = map.get(p.membership_id) || [];
            list.push(p.reference_number.toLowerCase());
            map.set(p.membership_id, list);
        });
        return map;
    }, [allPayments]);

    // Filtrado memoizado y reactivo
    const filteredCustomers = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase();
        if (!term) return customers;

        return customers.filter(c => {
            const matchesName = c.customer_name?.toLowerCase().includes(term);
            if (matchesName) return true;

            const refs = referencesByMember.get(c.id);
            return refs ? refs.some(ref => ref.includes(term)) : false;
        });
    }, [customers, debouncedSearch, referencesByMember]);

    // Paginación eficiente
    const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
    const paginatedCustomers = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredCustomers.slice(start, start + PAGE_SIZE);
    }, [filteredCustomers, currentPage]);

    if (selectedCustomerId) {
        return <CustomerDetails customerId={selectedCustomerId} onBack={() => setSelectedCustomerId(null)} />;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header con Buscador */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h1 className="text-3xl font-black text-zinc-100 uppercase tracking-tighter">
                        Gestión de Pagos
                    </h1>
                    <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">
                        Selecciona un Miembro para gestionar su cuenta ({filteredCustomers.length} encontrados)
                    </p>
                </div>
                
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input 
                        type="text"
                        placeholder="Buscar por nombre o referencia..."
                        className="w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-800 rounded-[1.5rem] outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 font-bold text-sm text-white shadow-xl transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid de Tarjetas */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="animate-spin text-orange-500" size={40} />
                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Cargando base de datos...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedCustomers.map((customer) => (
                        <div 
                            key={customer.id} 
                            className="bg-zinc-900 rounded-[2.5rem] p-6 border border-zinc-800 shadow-xl hover:border-orange-500 transition-all group"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center text-zinc-500 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                    <User size={24} />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <h3 className="font-black text-zinc-100 uppercase truncate text-base tracking-tight">
                                        {customer.customer_name}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${customer.status_member === 'activo' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">{customer.status_member}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 pt-4 border-t border-zinc-800">
                                <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase italic">
                                    <span className="flex items-center gap-1"><Calendar size={14}/> Vence:</span>
                                    <span className="text-zinc-100 font-black uppercase tracking-tight text-sm">
                                        {getExpirationDate(customer)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase italic">
                                    <span className="flex items-center gap-1"><Activity size={14}/> Plan:</span>
                                    <span className="text-orange-500 font-black text-sm">{customer.plan_name}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button 
                                    onClick={() => setInspectCustomer(customer)}
                                    className="py-3 bg-black hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-zinc-800 flex items-center justify-center gap-1"
                                >
                                    Ver Ficha
                                </button>
                                
                                <button 
                                    onClick={() => setSelectedCustomerId(customer.id)}
                                    className="py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-b-2 border-orange-800 flex items-center justify-center gap-1 shadow-lg shadow-orange-600/10"
                                >
                                    <CreditCard size={14} /> Pagos
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Paginación */}
            {totalPages > 1 && !loading && (
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

            {/* Modal de Ficha */}
            {inspectCustomer && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in">
                    <div className="bg-zinc-900 text-white rounded-[2.5rem] shadow-2xl w-full max-w-md border border-zinc-800 overflow-hidden">
                        <div className="px-8 py-5 border-b border-zinc-800 flex justify-between items-center bg-black/40">
                            <div>
                                <h2 className="font-black text-zinc-100 uppercase tracking-tighter text-lg">Ficha del Miembro</h2>
                                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest italic">Datos Registrados</p>
                            </div>
                            <button onClick={() => setInspectCustomer(null)} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all"><X size={20}/></button>
                        </div>

                        {/* Cuerpo Modal */}
                        <div className="p-8 space-y-4">
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-4 bg-black rounded-2xl border border-zinc-800/80">
                                    <User className="text-orange-500" size={20} />
                                    <div>
                                        <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Nombre Completo</p>
                                        <p className="text-sm font-black text-zinc-200 uppercase">{inspectCustomer.customer_name}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 p-4 bg-black rounded-2xl border border-zinc-800/80">
                                    <Fingerprint className="text-orange-500" size={20} />
                                    <div>
                                        <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Cédula / ID</p>
                                        <p className="text-sm font-black text-zinc-200">{inspectCustomer.cedula || 'V-00.000.000'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 p-4 bg-black rounded-2xl border border-zinc-800/80">
                                    <Phone className="text-orange-500" size={20} />
                                    <div>
                                        <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Teléfono de Contacto</p>
                                        <p className="text-sm font-black text-zinc-200">{inspectCustomer.phone || 'Sin número registrado'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 p-4 bg-orange-950/20 rounded-2xl border border-orange-900/30">
                                    <Activity className="text-orange-500" size={20} />
                                    <div>
                                        <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest">Suscripción Actual</p>
                                        <p className="text-sm font-black text-orange-500 uppercase">{inspectCustomer.plan_name}</p>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => setInspectCustomer(null)}
                                className="w-full py-4 mt-4 bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-orange-700 border-b-2 border-orange-800 transition-all shadow-lg shadow-orange-600/10"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!loading && filteredCustomers.length === 0 && (
                <div className="text-center py-20 bg-zinc-900 rounded-[3rem] border-2 border-dashed border-zinc-800">
                    <p className="font-black text-zinc-500 uppercase tracking-widest">No se encontraron Miembros</p>
                </div>
            )}
        </div>
    );
}