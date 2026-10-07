import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
    UserPlus, Camera, Phone, User, 
    CheckCircle2, AlertCircle, X, Loader2,
    Star, DollarSign, CreditCard, Hash
} from 'lucide-react';
import { addDays, addMonths, format } from 'date-fns';
import { ImageUpload } from './ImageUpload';
import { useExchangeRate } from '../hooks/useExchangeRate';

interface Plan {
    id: string;
    name: string;
    price: number;
    duration_days: number;
}

interface MembershipFormProps {
    onClose?: () => void;
    onSuccess?: () => void;
    initialData?: any; 
}

export default function MembershipForm({ onClose, onSuccess, initialData }: MembershipFormProps) {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [trainers, setTrainers] = useState<any[]>([]); 
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
    
    const [previewUrl, setPreviewUrl] = useState<string | null>(initialData?.photo_url || null);

    const [paymentMethod, setPaymentMethod] = useState('Efectivo');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [paymentImageUrl, setPaymentImageUrl] = useState('');

    const [formData, setFormData] = useState({
        customer_name: initialData?.customer_name || '',
        cedula: initialData?.cedula || '',
        phone: initialData?.phone || '',
        plan_id: initialData?.plan_id || '',
        price: initialData?.price || 0,
        start_date: initialData?.start_date || format(new Date(), 'yyyy-MM-dd'),
        end_date: initialData?.end_date || '',
        status: (initialData?.status as 'pagado' | 'pendiente') || 'pendiente',
        photo_url: initialData?.photo_url || '',
        trainer_name: initialData?.trainer_name || '',
        role: initialData?.role || 'socio' 
    });

    const isAlreadyPaid = initialData?.status === 'pagado';
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    const { rate: bcvRate } = useExchangeRate();
    const [amountInBs, setAmountInBs] = useState<number>(0);

    useEffect(() => {
        const cleanPrice = typeof formData.price === 'string' ? formData.price.replace(',', '.') : formData.price;
        const floatAmount = Number(cleanPrice);
        if (!isNaN(floatAmount) && floatAmount > 0 && bcvRate > 0) {
            setAmountInBs(Math.round(floatAmount * bcvRate * 100) / 100);
        } else {
            setAmountInBs(0);
        }
    }, [formData.price, bcvRate]);

    useEffect(() => { 
        if (user?.id) {
            fetchPlans();
            fetchTrainers(); 
        } 
    }, [user?.id]);

    useEffect(() => {
        if (formData.plan_id && formData.start_date && plans.length > 0) {
            const selectedPlan = plans.find(p => p.id === formData.plan_id);
            if (selectedPlan) {
                let calculatedEnd;
                const months = Math.round(selectedPlan.duration_days / 30);
                if (months >= 1 && selectedPlan.duration_days >= 28) {
                    calculatedEnd = addMonths(new Date(formData.start_date + 'T12:00:00'), months);
                } else {
                    calculatedEnd = addDays(new Date(formData.start_date + 'T12:00:00'), selectedPlan.duration_days);
                }
                const newEndDate = format(calculatedEnd, 'yyyy-MM-dd');
                if (newEndDate !== formData.end_date) {
                    setFormData(prev => ({ ...prev, end_date: newEndDate }));
                }
            }
        }
    }, [formData.start_date, formData.plan_id, plans]);



    async function fetchPlans() {
        const { data } = await supabase.from('membership_types').select('*').eq('user_id', user?.id);
        if (data) setPlans(data);
    }

    async function fetchTrainers() {
        try {
            const { data, error } = await supabase
                .from('staff') 
                .select('full_name, role')
                .eq('user_id', user?.id)
                .ilike('role', 'entrenador'); 
            
            if (error) throw error;
            
            if (data) {
                const formattedData = data.map(t => ({
                    customer_name: t.full_name
                }));
                setTrainers(formattedData);
            }
        } catch (err) {
            console.error("Error al buscar entrenadores en la tabla staff:", err);
        }
    }

   const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user?.id}/${fileName}`;

        try {
            // OPTIMIZACIÓN: Forzamos el contentType y pasamos el archivo directamente
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type // <-- Esto le dice a Supabase exactamente qué está recibiendo
                });
                
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setPreviewUrl(publicUrl);
            setFormData(prev => ({ ...prev, photo_url: publicUrl }));
        } catch (error: any) {
            // Alerta mejorada para que veas el error real si persiste
            alert('Error subiendo imagen: ' + (error.error_description || error.message || error));
        } finally {
            setUploading(false);
        }
    };
    
    const handlePlanChange = (planId: string) => {
        const selectedPlan = plans.find(p => p.id === planId);
        if (selectedPlan) {
            let calculatedEnd;
            const months = Math.round(selectedPlan.duration_days / 30);
            if (months >= 1 && selectedPlan.duration_days >= 28) {
                calculatedEnd = addMonths(new Date(formData.start_date + 'T12:00:00'), months);
            } else {
                calculatedEnd = addDays(new Date(formData.start_date + 'T12:00:00'), selectedPlan.duration_days);
            }
            setFormData({
                ...formData,
                plan_id: planId,
                price: selectedPlan.price,
                end_date: format(calculatedEnd, 'yyyy-MM-dd')
            });
        }
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        
        const payload: any = {
            ...formData,
            status_member: formData.status === 'pagado' ? 'activo' : 'pendiente',
            user_id: user?.id,
            plan_name: plans.find(p => p.id === formData.plan_id)?.name || initialData?.plan_name
        };
        delete payload.status;

        const { data, error } = initialData?.id 
            ? await supabase.from('memberships').update(payload).eq('id', initialData.id).select()
            : await supabase.from('memberships').insert([payload]).select();

        if (error) {
            setMessage({ type: 'error', text: 'Error: ' + error.message });
        } else {
            const membershipId = initialData?.id || (data && data[0]?.id);
            const isPayingNow = formData.status === 'pagado' && !isAlreadyPaid;

            if (isPayingNow && membershipId) {
                const { error: paymentError } = await supabase.from('payments').insert([{
                    membership_id: membershipId,
                    user_id: user?.id,
                    amount: formData.price,
                    amount_bs: amountInBs,
                    bcv_rate: bcvRate,
                    payment_method: paymentMethod,
                    reference_number: referenceNumber,
                    payment_image_url: paymentImageUrl,
                    description: `Pago inicial de membresía (${payload.plan_name}) - Tasa BCV: ${bcvRate} Bs.`
                }]);

                if (paymentError) {
                    console.error("Error al registrar el pago inicial:", paymentError);
                }
            }

            setMessage({ type: 'success', text: initialData?.id ? '¡Datos actualizados!' : '¡Miembro registrado con éxito!' });
            if (onSuccess) onSuccess();
            setTimeout(() => { if (onClose) onClose(); }, 1500);
        }
        setLoading(false);
    }


    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl w-full max-w-2xl mx-auto text-white flex flex-col max-h-[90vh]">
            {/* CABECERA CON ESTILO ENERGYM */}
            <div className="bg-black p-5 border-b border-zinc-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-orange-500" />
                    <span className="font-black uppercase tracking-wider text-xs italic">
                        {initialData?.id ? 'Editar Miembro' : 'Nueva Inscripción'}
                    </span>
                </div>
                {onClose && (
                    <button onClick={onClose} className="hover:bg-zinc-800 p-1.5 rounded-full transition-colors border border-transparent hover:border-zinc-700">
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scroll">
                {message && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in border ${message.type === 'success' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30' : 'bg-red-950/40 text-red-400 border-red-900/30'}`}>
                        {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <span className="text-xs font-black uppercase tracking-wide">{message.text}</span>
                    </div>
                )}

                <div className="flex flex-col md:flex-row gap-6 items-center">
                    {/* FOTO DE PERFIL / AVATAR */}
                    <div className="relative group">
                        <div className="w-32 h-32 rounded-2xl bg-black border-2 border-dashed border-zinc-800 group-hover:border-orange-500/50 flex items-center justify-center overflow-hidden transition-colors shadow-inner">
                            {previewUrl ? <img src={previewUrl} alt="" className="w-full h-full object-cover" /> : <Camera className="w-8 h-8 text-zinc-600" />}
                            {uploading && <div className="absolute inset-0 bg-black/70 flex items-center justify-center"><Loader2 className="w-6 h-6 text-orange-500 animate-spin" /></div>}
                        </div>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute -bottom-2 -right-2 bg-orange-600 text-white p-2 rounded-lg shadow-lg hover:bg-orange-700 transition-transform active:scale-90 border-b-2 border-orange-800"><Camera className="w-4 h-4" /></button>
                        <input type="file" ref={fileInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
                    </div>

                    {/* DATOS BÁSICOS */}
                    <div className="flex-1 w-full grid grid-cols-1 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Nombre Completo</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input required type="text" className="w-full pl-10 pr-4 py-2 bg-black border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold placeholder-zinc-700 text-sm" 
                                    value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} placeholder="Ej: Juan Pérez" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Teléfono</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input type="tel" className="w-full pl-10 pr-4 py-2 bg-black border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold placeholder-zinc-700 text-sm" 
                                        value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="0412..." />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Cédula</label>
                                <input type="text" className="w-full px-4 py-2 bg-black border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold placeholder-zinc-700 text-sm" 
                                    value={formData.cedula} onChange={e => setFormData({...formData, cedula: e.target.value})} placeholder="V-..." />
                            </div>
                        </div>
                    </div>
                </div>

                {/* CONTENEDOR INTERNO DE PLANES Y ASIGNACIÓN */}
                <div className="p-5 bg-black rounded-3xl border border-zinc-800/80 space-y-5 shadow-inner">
                    {/* SELECT ENTRENADOR */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-500 uppercase flex items-center gap-1 tracking-wider">
                            <Star size={10} className="text-purple-500" /> Entrenador Asignado
                        </label>
                        <select className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold text-sm text-zinc-300" 
                            value={formData.trainer_name} onChange={e => setFormData({...formData, trainer_name: e.target.value})}>
                            <option value="">Sin entrenador asignado</option>
                            {trainers.map((t, idx) => (
                                <option key={idx} value={t.customer_name}>{t.customer_name.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Seleccionar Plan</label>
                            <select required className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm text-zinc-300" 
                                value={formData.plan_id} onChange={e => handlePlanChange(e.target.value)}>
                                <option value="">--- Seleccione ---</option>
                                {plans.map(p => <option key={p.id} value={p.id}>{p.name} (${p.price})</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Estatus de Pago</label>
                            <select className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm text-zinc-300" 
                                value={formData.status} onChange={e => {
                                    const val = e.target.value as any;
                                    setFormData({...formData, status: val});
                                    if (val === 'pagado' && !isAlreadyPaid) setIsPaymentModalOpen(true);
                                }}>
                                <option value="pendiente">🟠 Pendiente</option>
                                <option value="pagado">🟢 Pagado</option>
                            </select>
                        </div>
                    </div>

                    {isPaymentModalOpen && (
                        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-6 space-y-6 w-full max-w-md animate-in zoom-in-95 duration-300 shadow-2xl relative">
                                <button type="button" onClick={() => {
                                    setFormData({...formData, status: 'pendiente'});
                                    setIsPaymentModalOpen(false);
                                }} className="absolute top-6 right-6 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 hover:text-red-500 transition-all z-10">
                                    <X size={20} />
                                </button>
                                
                                <h4 className="text-lg font-black uppercase tracking-wide text-orange-500 flex items-center gap-2 border-b border-zinc-800 pb-4">
                                    <DollarSign className="w-6 h-6" /> Detalles del Pago
                                </h4>
                                
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                            <CreditCard className="w-3.5 h-3.5 text-orange-500" /> Método de Pago
                                        </label>
                                        <select 
                                            className="w-full p-3 bg-black border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm text-zinc-300"
                                            value={paymentMethod}
                                            onChange={e => setPaymentMethod(e.target.value)}
                                        >
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Divisas">Divisas</option>
                                            <option value="Pago movil">Pago móvil</option>
                                            <option value="Zelle">Zelle</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                            <Hash className="w-3.5 h-3.5 text-orange-500" /> Referencia (Opcional)
                                        </label>
                                        <input 
                                            type="text" 
                                            placeholder="Nro de Referencia" 
                                            className="w-full p-3 bg-black border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm text-zinc-300 placeholder-zinc-700"
                                            value={referenceNumber}
                                            onChange={e => setReferenceNumber(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5 flex flex-col justify-between pt-2 border-t border-zinc-800">
                                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider ml-1">Comprobante de Pago (Opcional)</label>
                                        <div className="bg-black rounded-2xl border-2 border-dashed border-zinc-800 p-2">
                                            <ImageUpload onImageSelected={setPaymentImageUrl} disabled={loading} />
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="pt-2">
                                    <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="w-full py-4 bg-orange-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-orange-500 transition-all text-sm border-b-4 border-orange-700 shadow-xl shadow-orange-900/20 active:scale-95">
                                        Confirmar Detalles
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Fecha de Inicio</label>
                            <input type="date" className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm text-zinc-300" 
                                value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                        </div>
                        <div className="flex flex-col items-center justify-center bg-zinc-900 text-white rounded-xl border border-zinc-800 shadow-md px-4">
                            <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Vencimiento</span>
                            <span className="text-base font-black tracking-tight text-orange-500 italic">{formData.end_date || '-- / -- / --'}</span>
                        </div>
                    </div>
                </div>

                {/* BOTÓN DE ENVIAR ACCIÓN */}
                <button 
                    type="submit" 
                    disabled={loading || uploading} 
                    className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black py-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-orange-600/10 active:scale-[0.98] border-b-2 border-orange-700 text-xs tracking-widest uppercase"
                >
                    {loading ? <Loader2 className="animate-spin text-white" /> : (
                        <>{initialData?.id ? <CheckCircle2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />} 
                        {initialData?.id ? 'GUARDAR CAMBIOS' : 'COMPLETAR REGISTRO'}</>
                    )}
                </button>
            </form>
        </div>
    );
}