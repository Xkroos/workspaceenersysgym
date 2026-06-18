import { useState, createContext, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';

// --- IMPORTACIONES DE COMPONENTES EXTERNOS ---
import { MembersList } from './components/MembersList';
import MembershipForm from './components/MembershipForm';
import Ajustes from './components/Ajustes';
import { StatisticsModule } from './components/StatisticsModule';
import { StaffModule } from './components/StaffModule'; // Importado correctamente
import { PaymentsModule } from './components/PaymentsModule';
import { FinancialOperationsModule } from './components/FinancialOperationsModule';

import {
    TrendingUp, BarChart3, Menu, X,
    Users, Settings, UserPlus, UserCheck, DollarSign,
    Wallet
} from 'lucide-react';

// --- CONTEXTO DE TEMA ---
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => { } });

const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as any) || 'light');

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// --- DASHBOARD PRINCIPAL ---
function Dashboard() {
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('members');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(false);
    const [bcvRate, setBcvRate] = useState<number | null>(null);

    useEffect(() => {
        const fetchBCVRate = async () => {
            try {
                const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
                const data = await response.json();
                if (data && data.promedio) {
                    setBcvRate(data.promedio);
                }
            } catch (err) {
                console.error("Error obteniendo tasa de DolarAPI:", err);
            }
        };
        fetchBCVRate();
    }, []);

    if (!user) return <Login />;

    return (
        <div className="h-screen bg-zinc-950 text-white flex flex-col transition-colors duration-300 overflow-hidden">

            {/* Barra de Navegación Superior */}
            <header className="bg-black border-b border-zinc-800 h-16 flex items-center px-6 shrink-0 z-[60] relative">
                <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-zinc-400 md:hidden hover:bg-zinc-800 rounded-lg">
                            {isMenuOpen ? <X /> : <Menu />}
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="bg-orange-600 p-1.5 rounded-lg shadow-lg shadow-orange-600/20">
                                <TrendingUp className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-lg font-black text-white italic tracking-tighter uppercase">
                                Ener<span className="text-orange-500">gym </span> Fitness Center
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {bcvRate && (
                            <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl flex items-center gap-2 hidden md:flex">
                                <span className="text-xs font-black text-orange-500 uppercase tracking-widest">Tasa BCV:</span>
                                <span className="text-sm font-black text-zinc-200">Bs. {bcvRate}</span>
                            </div>
                        )}
                        <button onClick={() => signOut()} className="px-4 py-2 bg-red-950/40 text-red-400 border border-red-900/50 rounded-xl font-black text-xs tracking-widest hover:bg-red-600 hover:text-white transition-all">
                            CERRAR SESIÓN
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex flex-1 overflow-hidden relative">
                {/* Menú Lateral */}
                <aside className={`fixed inset-y-0 left-0 z-50 md:static md:w-64 w-64 bg-black p-4 flex flex-col space-y-1.5 transition-transform duration-300 border-r border-zinc-900 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                    <SidebarItem active={activeTab === 'members'} onClick={() => { setActiveTab('members'); setIsMenuOpen(false); }} icon={<Users size={18} />} label="Registro" />
                    <SidebarItem active={activeTab === 'payments'} onClick={() => { setActiveTab('payments'); setIsMenuOpen(false); }} icon={<DollarSign size={18} />} label="Miembros y pagos" />
                    <SidebarItem active={activeTab === 'financial'} onClick={() => { setActiveTab('financial'); setIsMenuOpen(false); }} icon={<Wallet size={18} />} label="Estadisticas" />
                    <SidebarItem active={activeTab === 'statistics'} onClick={() => { setActiveTab('statistics'); setIsMenuOpen(false); }} icon={<BarChart3 size={18} />} label="Notificaciones" />
                    {/* Botón de Notas ahora abre StaffModule */}
                    <SidebarItem active={activeTab === 'notes'} onClick={() => { setActiveTab('notes'); setIsMenuOpen(false); }} icon={<UserCheck size={18} />} label="Entrenadores" />
                    <div className="pt-4 mt-4 border-t border-zinc-900">
                        <SidebarItem active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setIsMenuOpen(false); }} icon={<Settings size={18} />} label="Membresias" />
                    </div>
                    <div className="mt-auto pt-6 pb-2 text-center text-[10px] text-zinc-600 font-medium tracking-wide">
                        © 2026 Desarrollado por <br/> <span className="text-orange-500 font-bold">Xkroos</span>. <br/> Todos los derechos reservados.
                    </div>
                </aside>

                {/* Área de Contenido */}
                <section className="flex-1 overflow-y-auto bg-zinc-950 custom-scroll">
                    <div className="p-4 md:p-8">
                        {activeTab === 'members' ? (
                            <div className="max-w-6xl mx-auto space-y-6">
                                {/* Banner de Panel Central */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-orange-600 to-orange-500 p-8 rounded-[2.5rem] shadow-2xl shadow-orange-600/10 text-white relative overflow-hidden border-b-4 border-orange-700">
                                    <div className="relative z-10">
                                        <h2 className="text-3xl font-black uppercase tracking-tighter italic">Panel Central</h2>
                                        <p className="text-orange-100 text-[10px] font-black uppercase tracking-widest opacity-90 mt-1">Control de Registros</p>
                                    </div>
                                    <button onClick={() => setIsModalOpen(true)} className="relative z-10 w-full sm:w-auto px-8 py-4 bg-black text-orange-500 rounded-2xl font-black text-xs hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl border border-zinc-800">
                                        <UserPlus size={18} /> REGISTRAR MIEMBRO
                                    </button>
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                                </div>

                                <MembersList refresh={refreshTrigger} />

                                {isModalOpen && (
                                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                                        <div className="animate-in zoom-in-95 duration-300 w-full max-w-2xl">
                                            <MembershipForm
                                                onClose={() => setIsModalOpen(false)}
                                                onSuccess={() => {
                                                    setIsModalOpen(false);
                                                    setRefreshTrigger(!refreshTrigger);
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                                {activeTab === 'payments' && <PaymentsModule />}
                                {activeTab === 'financial' && <FinancialOperationsModule />}
                                {activeTab === 'statistics' && <StatisticsModule />}
                                {activeTab === 'settings' && <Ajustes />}
                                {activeTab === 'notes' && <StaffModule />} {/* Cambiado de NotesModule a StaffModule */}
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}

function SidebarItem({ active, onClick, icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all font-black text-[10px] uppercase tracking-[0.2em] ${active
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/40 translate-x-1 border-b-2 border-orange-700'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-white hover:translate-x-1'
                }`}
        >
            {icon} {label}
        </button>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <ThemeProvider>
                <Dashboard />
            </ThemeProvider>
        </AuthProvider>
    );
}