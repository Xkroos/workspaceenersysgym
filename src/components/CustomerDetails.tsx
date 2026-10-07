import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ArrowLeft, 
  User, 
  CreditCard, 
  Clock,
  MoreVertical,
  Eye,
  Download,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { exportCustomerHistoryPDF } from '../lib/pdfExport';

interface CustomerDetailsProps {
  customerId: string;
  onBack: () => void;
}

export function CustomerDetails({ customerId, onBack }: CustomerDetailsProps) {
  const [customer, setCustomer] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    fetchFullData();
  }, [customerId]);

  const fetchFullData = async () => {
    setLoading(true);
    try {
      const { data: customerData } = await supabase.from('memberships').select('*').eq('id', customerId).single();
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('membership_id', customerId)
        .order('created_at', { ascending: false });

      setCustomer(customerData);
      setPayments(paymentsData || []);
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Comprobante-${fileName}.jpg`;
      link.click();
    } catch (err) {
      console.error("Error al descargar:", err);
    }
  };

  const generateMemberPDF = async () => {
    if (!customer || generatingPdf) return;
    try {
      setGeneratingPdf(true);
      await exportCustomerHistoryPDF(customer, payments);
    } catch (err) {
      console.error("Error al exportar PDF:", err);
      alert("Error al generar el archivo PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Clock className="animate-spin text-orange-500" size={40} />
      <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Abriendo expediente...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 relative text-white">
      
      {/* Botón Volver */}
      <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-orange-500 font-black text-[10px] uppercase tracking-widest transition-all">
        <ArrowLeft size={16} /> Volver al listado
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Perfil del miembro */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900 rounded-[2.5rem] p-8 border border-zinc-800 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-orange-600 rounded-[2rem] flex items-center justify-center text-white mb-4 shadow-xl shadow-orange-600/20 border-b-4 border-orange-700">
                <User size={40} />
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">{customer?.customer_name}</h2>
              <span className={`mt-2 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${customer?.status_member === 'activo' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50' : 'bg-red-950/40 text-red-400 border-red-900/50'}`}>
                {customer?.status_member}
              </span>
            </div>
            <div className="mt-8 space-y-4">
              <div className="p-4 bg-black rounded-2xl border border-zinc-800">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Plan Actual</p>
                <p className="text-base font-black text-orange-500 uppercase italic">{customer?.plan_name}</p>
              </div>
              <div className="p-4 bg-black rounded-2xl border border-zinc-800">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Vencimiento</p>
                <p className="text-base font-black text-white uppercase">{customer?.end_date}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Historial de Pagos */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 rounded-[2.5rem] border border-zinc-800 overflow-hidden shadow-2xl">
            <div className="px-8 py-6 border-b border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black">
              <h3 className="font-black text-white uppercase tracking-tighter flex items-center gap-2 italic">
                <CreditCard size={18} className="text-orange-500" /> Historial de Pagos
              </h3>
              <button 
                onClick={generateMemberPDF} 
                disabled={generatingPdf}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-orange-700 shadow-lg shadow-orange-600/20 transition-all border-b-2 border-orange-700 disabled:opacity-50"
              >
                <Download size={14} className={generatingPdf ? "animate-bounce" : ""} /> 
                {generatingPdf ? "Generando PDF..." : "Exportar Historial (PDF)"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800 text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] bg-zinc-950">
                    <th className="px-8 py-4">Fecha</th>
                    <th className="px-8 py-4">Método</th>
                    <th className="px-8 py-4">Referencia</th>
                    <th className="px-8 py-4 text-right">Monto en Dólares</th>
                    <th className="px-8 py-4 text-right">Tasa BCV</th>
                    <th className="px-8 py-4 text-right">Monto en Bolívares</th>
                    <th className="px-8 py-4 text-center">Comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-950/40 transition-colors">
                      <td className="px-8 py-4 text-[11px] font-bold text-zinc-300">
                        {format(new Date(p.created_at), "dd/MM/yyyy", { locale: es })}
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-[9px] font-black uppercase text-zinc-400 bg-zinc-800 px-2 py-1 rounded border border-zinc-700">
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="px-8 py-4 font-mono text-[10px] text-zinc-500">{p.reference_number || '---'}</td>
                      <td className="px-8 py-4 text-right font-black text-emerald-500 text-sm">${Number(p.amount).toFixed(2)}</td>
                      <td className="px-8 py-4 text-right font-black text-zinc-400 text-sm">{p.bcv_rate ? `Bs. ${Number(p.bcv_rate).toFixed(2)}` : '---'}</td>
                      <td className="px-8 py-4 text-right font-black text-zinc-300 text-sm">{p.amount_bs ? `Bs. ${Number(p.amount_bs).toFixed(2)}` : '---'}</td>
                      <td className="px-8 py-4 text-center relative">
                        {p.payment_image_url ? (
                          <div className="flex justify-center">
                            <button 
                              onClick={() => setActiveMenu(activeMenu === p.id ? null : p.id)}
                              className="p-2 hover:bg-zinc-800 rounded-full transition-all text-zinc-500 hover:text-orange-500"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {activeMenu === p.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)}></div>
                                <div className="absolute right-12 mt-0 w-44 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in zoom-in duration-200">
                                  <button 
                                    onClick={() => {
                                      setPreviewImage(p.payment_image_url);
                                      setActiveMenu(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase text-zinc-300 hover:bg-orange-600 hover:text-white transition-all text-left"
                                  >
                                    <Eye size={14} /> Previsualizar
                                  </button>
                                  <button 
                                    onClick={() => {
                                      downloadImage(p.payment_image_url, p.reference_number || p.id);
                                      setActiveMenu(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase text-zinc-300 hover:bg-zinc-800 border-t border-zinc-800 transition-all text-left"
                                  >
                                    <Download size={14} /> Descargar
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-[8px] font-black text-zinc-600 uppercase italic tracking-widest">Sin archivo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 bg-black border-t border-zinc-800 flex justify-end gap-4">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest self-center">Total Recaudado:</span>
              <span className="text-xl font-black text-orange-500 tracking-tighter">
                ${payments.reduce((acc, curr) => acc + Number(curr.amount), 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE VISTA PREVIA (Lightbox) */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="bg-zinc-900 rounded-[2.5rem] overflow-hidden max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-300 border border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
            <div className="px-8 py-5 border-b border-zinc-800 flex justify-between items-center bg-black">
              <div>
                <h3 className="font-black text-white uppercase tracking-tighter text-sm italic">Comprobante de Pago</h3>
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest italic">ENERGYGYM FITNESS CENTER</p>
              </div>
              <button 
                onClick={() => setPreviewImage(null)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-500 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenedor de la Imagen */}
            <div className="p-6 bg-zinc-950 flex justify-center items-center min-h-[300px]">
              <img 
                src={previewImage} 
                alt="Comprobante" 
                className="max-h-[60vh] w-auto rounded-2xl shadow-2xl border-4 border-zinc-800 object-contain"
              />
            </div>

            {/* Pie del Modal */}
            <div className="p-6 border-t border-zinc-800 flex justify-center bg-black gap-3">
              <button 
                onClick={() => setPreviewImage(null)}
                className="px-8 py-3 bg-zinc-900 text-zinc-300 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all border border-zinc-800"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}