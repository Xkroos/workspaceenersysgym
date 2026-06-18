import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  Fingerprint
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CustomerDetails } from './CustomerDetails';

export function PaymentsModule() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [inspectCustomer, setInspectCustomer] = useState<any | null>(null);
    const [allPayments, setAllPayments] = useState<any[]>([]);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const { data: memData, error: memErr } = await supabase
                .from('memberships')
                .select('*')
                .order('customer_name', { ascending: true });

            if (memErr) throw memErr;
            setCustomers(memData || []);

            const { data: payData } = await supabase
                .from('payments')
                .select('membership_id, reference_number');
            if (payData) setAllPayments(payData);
        } catch (err) {
            console.error("Error cargando Miembro:", err);
        } finally {
            setLoading(false);
        }
    };

    // Función auxiliar para calcular o formatear el vencimiento en tiempo real
    const getExpirationDate = (customer: any) => {
        // 1. Si ya existe una fecha de vencimiento explícita en la base de datos, la usamos
        if (customer.end_date) {
            // Añadimos T12:00:00 para evitar problemas de zona horaria al formatear
            return format(new Date(customer.end_date + 'T12:00:00'), "dd MMM, yyyy", { locale: es });
        }
        
        // 2. Si no existe, la calculamos sumando 30 días a la fecha de registro (created_at)
        if (customer.created_at) {
            const registrationDate = new Date(customer.created_at);
            const calculatedExpiration = addDays(registrationDate, 30); // Cambia 30 por los días de tus planes si varía
            return format(calculatedExpiration, "dd MMM, yyyy", { locale: es });
        }

        return 'No registrada';
    };

    const filteredCustomers = customers.filter(c => {
        const term = searchTerm.toLowerCase();
        const matchesName = c.customer_name?.toLowerCase().includes(term);
        const matchesRef = allPayments.some(p => 
            p.membership_id === c.id && 
            p.reference_number && 
            p.reference_number.toLowerCase().includes(term)
        );
        return matchesName || matchesRef;
    });

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
                        Selecciona un Miembro para gestionar su cuenta
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
                    {filteredCustomers.map((customer) => (
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
                                    {/* AQUÍ SE EJECUTA EL CÁLCULO EN TIEMPO REAL */}
                                    <span className="text-zinc-100 font-black uppercase tracking-tight text-sm">
                                        {getExpirationDate(customer)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase italic">
                                    <span className="flex items-center gap-1"><Activity size={14}/> Plan:</span>
                                    <span className="text-orange-500 font-black text-sm">{customer.plan_name}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2 mt-6">
                                <button 
                                    onClick={() => setSelectedCustomerId(customer.id)}
                                    className="flex items-center justify-center gap-2 py-3 bg-black text-white border border-zinc-800/80 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 hover:border-orange-600 transition-all"
                                >
                                    <CreditCard size={14} /> Historial de Pagos
                                </button>
                                <button 
                                    onClick={() => setInspectCustomer(customer)}
                                    className="flex items-center justify-center gap-2 py-3 bg-zinc-950 text-zinc-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all"
                                >
                                    Ver Datos del Miembro <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODAL EMERGENTE: DATOS DEL Miembro */}
            {inspectCustomer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div 
                        className="bg-zinc-900 w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-zinc-800 animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Cabecera Modal */}
                        <div className="relative p-8 bg-black/40 border-b border-zinc-800">
                            <button 
                                onClick={() => setInspectCustomer(null)}
                                className="absolute right-6 top-6 p-2 bg-zinc-900 rounded-full text-zinc-500 hover:text-red-500 transition-all"
                            >
                                <X size={18} />
                            </button>
                            
                            <div className="flex flex-col items-center">
                                <div className="w-20 h-20 bg-orange-600 rounded-[1.5rem] flex items-center justify-center text-white mb-4 shadow-xl shadow-orange-600/20">
                                    <User size={32} />
                                </div>
                                <h2 className="text-xl font-black text-zinc-100 uppercase tracking-tighter text-center">
                                    Información del Miembro
                                </h2>
                                <span className={`mt-2 px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${inspectCustomer.status_member === 'activo' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/40' : 'bg-red-950/50 text-red-400 border border-red-900/40'}`}>
                                    {inspectCustomer.status_member}
                                </span>
                            </div>
                        </div>

                        {/* Cuerpo Modal */}
                        <div className="p-8 space-y-4">
                            <div className="space-y-4">
                                {/* Campo: Nombre */}
                                <div className="flex items-center gap-4 p-4 bg-black rounded-2xl border border-zinc-800/80">
                                    <User className="text-orange-500" size={20} />
                                    <div>
                                        <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Nombre Completo</p>
                                        <p className="text-sm font-black text-zinc-200 uppercase">{inspectCustomer.customer_name}</p>
                                    </div>
                                </div>

                                {/* Campo: Cédula */}
                                <div className="flex items-center gap-4 p-4 bg-black rounded-2xl border border-zinc-800/80">
                                    <Fingerprint className="text-orange-500" size={20} />
                                    <div>
                                        <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Cédula / ID</p>
                                        <p className="text-sm font-black text-zinc-200">{inspectCustomer.cedula || 'V-00.000.000'}</p>
                                    </div>
                                </div>

                                {/* Campo: Teléfono */}
                                <div className="flex items-center gap-4 p-4 bg-black rounded-2xl border border-zinc-800/80">
                                    <Phone className="text-orange-500" size={20} />
                                    <div>
                                        <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Teléfono de Contacto</p>
                                        <p className="text-sm font-black text-zinc-200">{inspectCustomer.phone || 'Sin número registrado'}</p>
                                    </div>
                                </div>

                                {/* Campo: Plan */}
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