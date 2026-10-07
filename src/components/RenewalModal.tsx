import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Check, Loader2, AlertTriangle, History, RefreshCw } from 'lucide-react';
import { addDays, addMonths, format } from 'date-fns';

interface RenewalModalProps {
    member: any;
    onClose: () => void;
    onSuccess: () => void;
}

export function RenewalModal({ member, onClose, onSuccess }: RenewalModalProps) {
    const [plans, setPlans] = useState<any[]>([]);
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 1. Cargar los tipos de membresía disponibles
    useEffect(() => {
        const fetchPlans = async () => {
            setLoadingPlans(true);
            setError(null);
            try {
                const { data, error: supabaseError } = await supabase
                    .from('membership_types') 
                    .select('*')
                    .order('price', { ascending: true });

                if (supabaseError) throw supabaseError;

                if (data) {
                    setPlans(data);
                    // Pre-seleccionar el plan actual por defecto
                    const current = data.find(p => p.name === member.plan_name);
                    if (current) setSelectedPlan(current);
                }
            } catch (err: any) {
                console.error("Error al cargar planes:", err.message);
                setError("No se pudieron cargar los planes.");
            } finally {
                setLoadingPlans(false);
            }
        };

        fetchPlans();
    }, [member.plan_name]);

    // 2. Ejecutar la renovación y registrar en Control de Pagos
    const handleRenew = async () => {
        if (!selectedPlan || !member.id) return;
        setIsSubmitting(true);
        setError(null);

        const now = new Date().toISOString();

        try {
            // Calcular nueva fecha de vencimiento
            const startDateStr = format(new Date(), 'yyyy-MM-dd');
            let calculatedEnd;
            const months = Math.round(selectedPlan.duration_days / 30);
            if (months >= 1 && selectedPlan.duration_days >= 28) {
                calculatedEnd = addMonths(new Date(startDateStr + 'T12:00:00'), months);
            } else {
                calculatedEnd = addDays(new Date(startDateStr + 'T12:00:00'), selectedPlan.duration_days);
            }
            const endDateStr = format(calculatedEnd, 'yyyy-MM-dd');

            // A. Actualizar la membresía (Nuevo plan y reinicio de fecha para limpiar abonos en la lista)
            const { error: updateError } = await supabase
                .from('memberships')
                .update({
                    plan_name: selectedPlan.name,
                    price: selectedPlan.price,
                    created_at: now,
                    start_date: startDateStr,
                    end_date: endDateStr
                })
                .eq('id', member.id);

            if (updateError) throw updateError;

            // B. Registrar el movimiento en la tabla de pagos (Control de Pagos)
            const { error: paymentError } = await supabase
                .from('payments')
                .insert([{
                    membership_id: member.id,
                    user_id: member.user_id,
                    amount: 0,
                    description: `RENOVACIÓN: Plan ${selectedPlan.name} ($${selectedPlan.price})`,
                    payment_method: 'Efectivo', 
                    created_at: now
                }]);

            if (paymentError) throw paymentError;
            
            onSuccess();
        } catch (err: any) {
            console.error("Error en proceso de renovación:", err.message);
            setError("Error al procesar: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-zinc-900 w-full max-w-md rounded-[3rem] p-8 relative shadow-2xl animate-in zoom-in-95 duration-300 border border-zinc-800">
                
                {/* Botón Cerrar */}
                <button 
                    onClick={onClose} 
                    className="absolute top-6 right-6 text-zinc-500 hover:text-red-500 transition-colors p-2 hover:bg-zinc-800 rounded-full"
                >
                    <X size={20}/>
                </button>

                {/* Encabezado */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-orange-600 text-white rounded-2xl shadow-xl shadow-orange-600/20">
                        <RefreshCw className="animate-spin" size={24} style={{ animationDuration: '3s' }} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-zinc-100 uppercase tracking-tighter leading-none">Nueva Renovación</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1.5 italic">
                            Miembro: {member.customer_name}
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Alerta de Error */}
                    {error && (
                        <div className="p-4 bg-red-950/40 border border-red-900/50 text-red-400 rounded-2xl text-xs font-bold flex items-center gap-2">
                            <AlertTriangle size={16} className="shrink-0" /> {error}
                        </div>
                    )}

                    {/* Información de Aviso */}
                    <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl">
                        <div className="flex gap-3">
                            <History className="text-orange-500 shrink-0" size={18} />
                            <p className="text-[10px] text-zinc-400 font-bold leading-relaxed uppercase tracking-wide">
                                Se iniciará un nuevo ciclo. Los pagos anteriores se mantendrán en el historial pero no afectarán el saldo actual.
                            </p>
                        </div>
                    </div>

                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">
                        Selecciona el nuevo Plan
                    </label>
                    
                    {loadingPlans ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-500">
                            <Loader2 className="animate-spin text-orange-500" size={32} />
                            <span className="text-[10px] font-black uppercase tracking-widest italic">Cargando planes...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 max-h-[230px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                            {plans.map((plan) => (
                                <button 
                                    key={plan.id}
                                    onClick={() => setSelectedPlan(plan)}
                                    className={`group p-4 rounded-2xl border-2 text-left transition-all relative ${
                                        selectedPlan?.id === plan.id 
                                        ? 'border-orange-500 bg-orange-950/20' 
                                        : 'border-zinc-800 bg-black/40 hover:border-zinc-700'
                                    }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <span className="block font-black text-zinc-200 text-sm uppercase tracking-tight group-hover:text-white transition-colors">
                                                {plan.name}
                                            </span>
                                            <span className={`text-lg font-black transition-colors ${
                                                selectedPlan?.id === plan.id ? 'text-orange-500' : 'text-zinc-400'
                                            }`}>
                                                ${Number(plan.price).toFixed(2)}
                                            </span>
                                        </div>
                                        {selectedPlan?.id === plan.id && (
                                            <div className="bg-orange-500 text-white p-1 rounded-full shadow-md shadow-orange-500/20">
                                                <Check size={14} strokeWidth={4} />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    <button 
                        onClick={handleRenew}
                        disabled={isSubmitting || !selectedPlan}
                        className="w-full py-4 bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:border-transparent text-white rounded-2xl font-black uppercase tracking-widest mt-4 hover:bg-orange-700 border-b-2 border-orange-800 disabled:hover:bg-zinc-800 transition-all shadow-lg shadow-orange-600/10 active:scale-98 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Procesando...
                            </>
                        ) : (
                            'Confirmar Renovación'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}