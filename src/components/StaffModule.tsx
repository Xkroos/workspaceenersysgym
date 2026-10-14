import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
   Plus, Trash2, UserCircle, 
   RefreshCcw, Loader2, Users, ChevronRight
} from 'lucide-react';

interface Trainer {
  id: string;
  full_name: string;
  status: 'activo' | 'inactivo';
  created_at: string;
}

export function StaffModule() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Trainer[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]); // Para contar alumnos
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [selectedTrainerAlumni, setSelectedTrainerAlumni] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: '',
    status: 'activo' as 'activo' | 'inactivo'
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    try {
      // Cargamos entrenadores y membresías en paralelo
      const [staffRes, membersRes] = await Promise.all([
        supabase.from('staff').select('*').eq('user_id', user.id).order('full_name', { ascending: true }),
        supabase.from('memberships').select('customer_name, trainer_name').eq('user_id', user.id)
      ]);

      if (staffRes.error) throw staffRes.error;
      
      setStaff(staffRes.data || []);
      setAllMembers(membersRes.data || []);
    } catch (error) {
      console.error('Error cargando entrenadores:', error);
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.full_name.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('staff').insert([{
        user_id: user.id,
        full_name: formData.full_name.trim(),
        status: formData.status,
      }]);
      if (error) throw error;
      setFormData({ full_name: '', status: 'activo' });
      setShowForm(false);
      await loadData();
    } catch (error) {
      console.error('Error al guardar entrenador:', error);
      alert('Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'activo' ? 'inactivo' : 'activo';
    await supabase.from('staff').update({ status: newStatus }).eq('id', id);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar entrenador?')) return;
    await supabase.from('staff').delete().eq('id', id);
    await loadData();
  };

  // Pre-agrupar alumnos por entrenador para búsqueda O(1) instantánea
  const alumniByTrainer = useMemo(() => {
    const map = new Map<string, any[]>();
    allMembers.forEach(m => {
      if (!m.trainer_name) return;
      const list = map.get(m.trainer_name) || [];
      list.push(m);
      map.set(m.trainer_name, list);
    });
    return map;
  }, [allMembers]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-zinc-900 p-6 rounded-[2.5rem] border border-zinc-800 shadow-xl gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-100 uppercase tracking-tighter">Personal</h2>
          <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">Gestión de entrenadores y alumnos asignados</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="px-6 py-3 bg-orange-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-700 border-b-2 border-orange-800 transition-all flex items-center gap-2 shadow-lg shadow-orange-600/10">
            <Plus className="w-4 h-4" /> Registrar Entrenador
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-6 shadow-2xl animate-in zoom-in-95">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase ml-1">Nombre Completo</label>
                <input autoFocus type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="w-full px-4 py-3 border border-zinc-800 rounded-xl bg-black text-white outline-none font-bold focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 text-sm" placeholder="Ej: Juan Pérez" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase ml-1">Estado</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as any })} className="w-full px-4 py-3 border border-zinc-800 rounded-xl bg-black text-white outline-none font-bold focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 text-sm">
                  <option value="activo">🟢 ACTIVO</option>
                  <option value="inactivo">🔴 INACTIVO</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-3 border border-zinc-800 text-zinc-400 rounded-xl font-black uppercase tracking-widest text-[10px] bg-zinc-950 hover:bg-zinc-800 transition-all">Cancelar</button>
              <button type="submit" disabled={loading} className="flex-1 px-4 py-3 bg-orange-600 border-b-2 border-orange-800 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-orange-600/10 hover:bg-orange-700 transition-all">{loading ? <Loader2 className="animate-spin mx-auto text-white" size={16} /> : 'GUARDAR'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Grid */}
      {fetching ? (
        <div className="flex flex-col items-center justify-center p-12 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Cargando Personal...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {staff.map((trainer) => {
            const alumni = alumniByTrainer.get(trainer.full_name) || [];
            
            return (
              <div key={trainer.id} className={`relative bg-zinc-900 border rounded-[2.5rem] p-5 shadow-xl transition-all ${trainer.status === 'inactivo' ? 'opacity-50 grayscale border-zinc-800' : 'border-zinc-800 hover:border-orange-500'}`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-3 rounded-2xl ${trainer.status === 'activo' ? 'bg-orange-950/30 text-orange-500 border border-orange-900/20' : 'bg-zinc-950 text-zinc-500'}`}>
                    <UserCircle size={32} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-zinc-100 truncate uppercase text-sm tracking-tight">{trainer.full_name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] font-black text-orange-500 bg-orange-950/20 px-2 py-0.5 rounded-md border border-orange-950/40 uppercase tracking-wider">
                        <Users size={10} /> {alumni.length} Alumnos
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button 
                    onClick={() => setSelectedTrainerAlumni(selectedTrainerAlumni === trainer.id ? null : trainer.id)}
                    className="w-full py-2.5 bg-black hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-zinc-800/80"
                  >
                    Ver Alumnos <ChevronRight size={14} className={`transition-transform text-orange-500 ${selectedTrainerAlumni === trainer.id ? 'rotate-90' : ''}`} />
                  </button>

                  {/* Lista Flotante de Alumnos */}
                  {selectedTrainerAlumni === trainer.id && (
                    <div className="absolute left-0 right-0 mt-2 mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in slide-in-from-top-2">
                      <div className="max-h-40 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-800">
                        {alumni.length > 0 ? alumni.map((alumno, idx) => (
                          <div key={idx} className="px-3 py-2 text-[10px] font-bold text-zinc-400 border-b border-zinc-900 last:border-0 flex items-center gap-2 uppercase tracking-wide">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                            {alumno.customer_name}
                          </div>
                        )) : (
                          <p className="p-4 text-[10px] text-center text-zinc-500 font-bold uppercase tracking-wider italic">Sin alumnos registrados</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800/80">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${trainer.status === 'activo' ? 'text-emerald-500' : 'text-red-400'}`}>
                    ● {trainer.status}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => toggleStatus(trainer.id, trainer.status)} className="p-2 text-zinc-500 hover:text-orange-500 transition-colors"><RefreshCcw size={14}/></button>
                    <button onClick={() => handleDelete(trainer.id)} className="p-2 text-zinc-500 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}