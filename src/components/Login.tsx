import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, HelpCircle } from 'lucide-react';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Al quitar la creación de cuenta, va directo al inicio de sesión
        // Se aplica .trim() para limpiar espacios invisibles que provocan el error 400
        const { error } = await signIn(email.trim(), password);

        if (error) {
            // Validamos la existencia de 'status' de forma segura para evitar fallos en TypeScript
            const isValidationError = error.message.includes("Invalid login credentials") || 
                                      ('status' in error && (error as any).status === 400);

            if (isValidationError) {
                setError("Correo o contraseña incorrectos.");
            } else if (error.message.includes("Email not confirmed")) {
                setError("El correo electrónico aún no ha sido confirmado.");
            } else {
                setError(error.message);
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col justify-between font-sans selection:bg-orange-600 selection:text-white">
            
            {/* CONTENEDOR PRINCIPAL */}
            <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto p-4 sm:p-8 animate-in fade-in zoom-in-95 duration-500">
                
                {/* LOGO DE ENERGYM */}
                <div className="flex flex-col items-center w-full mb-8">
                    <img 
                        src="/energym_logo.jpg" 
                        alt="Energym Logo" 
                        className="w-full max-w-[280px] h-auto object-contain drop-shadow-2xl mb-4" 
                    />
                    <p className="text-gray-400 text-xs mt-2 font-mono tracking-widest uppercase">
                        J-504846821
                    </p>
                    <p className="text-orange-500 text-[10px] sm:text-xs font-bold uppercase tracking-widest mt-2 italic">
                        ¡Transformamos cuerpos y mentes!
                    </p>
                </div>

                {/* FORMULARIO */}
                <div className="w-full">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        
                        {/* INPUT: Email / Usuario */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-zinc-500">
                                <Mail className="w-5 h-5" />
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 bg-zinc-900 text-gray-200 font-medium placeholder-zinc-500 rounded-2xl border border-zinc-800 focus:outline-none focus:bg-zinc-800 focus:border-orange-500 transition-all text-sm shadow-inner"
                                placeholder="Usuario (Email)"
                                required
                            />
                        </div>
                        
                        {/* INPUT: Contraseña */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-zinc-500">
                                <Lock className="w-5 h-5" />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 bg-zinc-900 text-gray-200 font-medium placeholder-zinc-500 rounded-2xl border border-zinc-800 focus:outline-none focus:bg-zinc-800 focus:border-orange-500 transition-all text-sm shadow-inner"
                                placeholder="Contraseña"
                                required
                            />
                        </div>
                        
                        {/* MENSAJE DE ERROR */}
                        {error && (
                            <div className="text-red-400 text-xs bg-red-950/50 border border-red-900 px-4 py-3 rounded-xl text-center font-bold">
                                {error}
                            </div>
                        )}
                        
                        {/* BOTÓN LOGIN */}
                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 bg-orange-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-orange-500 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-orange-900/20 text-sm border-b-4 border-orange-700 hover:border-orange-600"
                            >
                                {loading ? 'Procesando...' : 'Iniciar Sesión'}
                            </button>
                        </div>
                        
                    </form>
                    
                    {/* ENLACE DE AYUDA */}
                    <div className="mt-8 flex justify-center text-xs text-zinc-500 font-medium">
                        <a 
                            href="https://wa.me/584128847390"
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="hover:text-orange-400 transition-colors flex items-center gap-1.5 uppercase tracking-wider"
                        >
                            <HelpCircle size={14}/> ¿Necesitas Ayuda?
                        </a>
                    </div>
                </div>
            </div>

            {/* BANNER DE DERECHOS RESERVADOS */}
            <div className="w-full py-4 bg-zinc-950 border-t border-zinc-900 text-center text-[11px] text-zinc-500 font-medium tracking-wide">
                © 2026 Desarrollado por <span className="text-orange-500 font-bold">Xkroos</span>. Todos los derechos reservados.
            </div>
        </div>
    );
}