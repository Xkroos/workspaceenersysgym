import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, CheckCircle2, DollarSign, CreditCard, Hash, Loader2, RefreshCw } from 'lucide-react'; 
import { ImageUpload } from './ImageUpload'; 

interface PaymentModalProps {
    id: string;
    orderTotal: number;
    customerName: string;
    onClose: () => void;
    onSuccess: () => void;
}

export function PaymentModal({ id, orderTotal, customerName, onClose, onSuccess }: PaymentModalProps) {
    const { user } = useAuth();
    const [amount, setAmount] = useState('');
    const [reference, setReference] = useState('');
    const [method, setMethod] = useState('Efectivo');
    const [imageData, setImageData] = useState('');
    const [payments, setPayments] = useState<any[]>([]);
    const [fetching, setFetching] = useState(true);
    const [loading, setLoading] = useState(false);

    // --- ESTADOS PARA CÁLCULO BCV ---
    const [bcvRate, setBcvRate] = useState<number>(0);
    const [amountInBs, setAmountInBs] = useState<number>(0);
    const [loadingRate, setLoadingRate] = useState(false);

    useEffect(() => {
        loadData();
        fetchBCVRate(); // Carga la tasa al abrir el modal
    }, [id]);

    // Calcular bolívares automáticamente cuando cambia el monto o la tasa
    useEffect(() => {
        const floatAmount = parseFloat(amount);
        if (!isNaN(floatAmount) && bcvRate > 0) {
            setAmountInBs(floatAmount * bcvRate);
        } else {
            setAmountInBs(0);
        }
    }, [amount, bcvRate]);

    const fetchBCVRate = async () => {
        setLoadingRate(true);
        try {
            const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            const data = await response.json();
            
            if (data && data.promedio) {
                setBcvRate(data.promedio);
            }
        } catch (err) {
            console.error("Error obteniendo tasa de DolarAPI:", err);
            // Podrías setear una tasa por defecto aquí si la API falla
        } finally {
            setLoadingRate(false);
        }
    };

    const loadData = async () => {
        setFetching(true);
        try {
            const { data: memberData } = await supabase.from('memberships').select('created_at').eq('id', id).single();
            const { data: paymentsData } = await supabase
                .from('payments')
                .select('*')
                .eq('membership_id', id)
                .gte('created_at', memberData?.created_at || new Date(0).toISOString());
            if (paymentsData) setPayments(paymentsData);
        } catch (err) { console.error(err); } finally { setFetching(false); }
    };

    const totalPaid = useMemo(() => payments.reduce((sum, p) => sum + Number(p.amount), 0), [payments]);
    const remaining = Math.max(0, orderTotal - totalPaid);

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        const floatAmount = parseFloat(amount);
        if (!user || isNaN(floatAmount) || floatAmount <= 0) return;
        
        if (!window.confirm(`¿Estás seguro que deseas registrar un pago por la cantidad de $${floatAmount}?`)) return;

        setLoading(true);
        try {
            const { error } = await supabase.from('payments').insert([{
                membership_id: id,
                user_id: user.id,
                amount: floatAmount,
                amount_bs: amountInBs,
                bcv_rate: bcvRate,
                payment_method: method,
                reference_number: reference,
                payment_image_url: imageData,
                description: `Abono a cuenta - Tasa BCV: ${bcvRate} Bs.`
            }]);
            if (error) throw error;
            if (totalPaid + floatAmount >= orderTotal) {
                await supabase.from('memberships').update({ status_member: 'activo' }).eq('id', id);
            }
            onSuccess();
        } catch (err: any) { alert("Error: " + err.message); } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in">
            <div className="bg-zinc-900 text-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl border border-zinc-800 overflow-hidden">
                
                {/* CABECERA DEL MODAL */}
                <div className="px-8 py-5 border-b border-zinc-800 flex justify-between items-center bg-black/40">
                    <div>
                        <h2 className="font-black text-zinc-100 uppercase tracking-tighter text-lg">Registrar Abono</h2>
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest italic">{customerName}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-red-950/20 text-zinc-500 hover:text-red-500 rounded-xl transition-all"><X size={20}/></button>
                </div>

                <form onSubmit={handlePayment} className="p-8">
                    {fetching ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-orange-500" size={32} />
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Sincronizando saldos...</span>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                
                                <div className="space-y-4">
                                    {/* VISUALIZADORES DE SALDO */}
                                    <div className="flex gap-2">
                                        <div className="flex-1 p-3 bg-red-950/20 rounded-2xl border border-red-900/30">
                                            <p className="text-[8px] font-black text-red-400 uppercase tracking-widest">Pendiente</p>
                                            <p className="text-lg font-black text-red-500">${remaining.toFixed(2)}</p>
                                        </div>
                                        <div className="flex-1 p-3 bg-black rounded-2xl border border-zinc-800">
                                            <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Total</p>
                                            <p className="text-lg font-black text-zinc-200">${orderTotal.toFixed(2)}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {/* MONTO EN DIVISAS Y TASA BCV */}
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-xs font-black text-zinc-300 uppercase tracking-widest">Monto en Divisas</label>
                                                <div className="flex items-center gap-1.5 bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-900/30">
                                                    <span className="text-xs font-black text-emerald-400 uppercase">BCV: {bcvRate.toFixed(2)} Bs.</span>
                                                    <button type="button" onClick={fetchBCVRate} className="text-emerald-400 hover:rotate-180 transition-all">
                                                        <RefreshCw size={8} className={loadingRate ? 'animate-spin' : ''} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" size={16} />
                                                <input 
                                                    type="number" step="0.01" placeholder="0.00" required
                                                    className="w-full pl-10 pr-4 py-3 bg-black border border-zinc-800 rounded-xl font-black text-sm text-white outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all"
                                                    value={amount} onChange={(e) => setAmount(e.target.value)}
                                                />
                                            </div>

                                            {/* VISUALIZACIÓN EN TIEMPO REAL BOLÍVARES */}
                                            {amountInBs > 0 && (
                                                <div className="px-4 py-3 bg-zinc-950 rounded-xl border border-zinc-800/60 animate-in slide-in-from-top-1">
                                                    <p className="text-xs font-black text-orange-500 flex justify-between">
                                                        <span className="text-zinc-300">Monto en Bolívares:</span>
                                                        <span className="text-sm">{amountInBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* MÉTODO DE PAGO */}
                                        <div className="relative">
                                            <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                            <select 
                                                className="w-full pl-10 pr-4 py-3 bg-black border border-zinc-800 rounded-xl font-bold text-sm text-zinc-300 appearance-none outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all"
                                                value={method} onChange={(e) => setMethod(e.target.value)}
                                            >
                                                <option value="Efectivo">Efectivo</option>
                                                <option value="Divisas">Divisas</option>
                                                <option value="Pago movil">Pago móvil</option>
                                                <option value="Zelle">Zelle</option>
                                            </select>
                                        </div>

                                        {/* REFERENCIA */}
                                        <div className="relative">
                                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                            <input 
                                                type="text" placeholder="Nro de Referencia"
                                                className="w-full pl-10 pr-4 py-3 bg-black border border-zinc-800 rounded-xl font-bold text-sm text-white outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all"
                                                value={reference} onChange={(e) => setReference(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* COMPROBANTE DE PAGO */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-zinc-300 uppercase tracking-widest ml-1">Comprobante de Pago</label>
                                    <div className="bg-black rounded-2xl border-2 border-dashed border-zinc-800 p-2 min-h-[160px] flex items-center justify-center">
                                        <ImageUpload onImageSelected={setImageData} disabled={loading} />
                                    </div>
                                </div>
                            </div>

                            {/* BOTÓN DE ACCIÓN */}
                            <button 
                                type="submit" 
                                disabled={loading || remaining <= 0}
                                className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black hover:bg-orange-700 disabled:opacity-50 disabled:grayscale transition-all flex justify-center items-center gap-3 shadow-xl shadow-orange-600/10 uppercase text-[10px] tracking-[0.2em] border-b-2 border-orange-800"
                            >
                                {loading ? (
                                    <Loader2 className="animate-spin" size={18} />
                                ) : (
                                    <><CheckCircle2 size={18}/> Confirmar y Finalizar</>
                                )}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}