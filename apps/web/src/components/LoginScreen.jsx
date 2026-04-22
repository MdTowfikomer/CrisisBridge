import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ShieldAlert, Loader2, Lock, Mail } from 'lucide-react';
import { auth } from '../lib/firebase';

export const LoginScreen = ({ targetRole }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Successful login will naturally update the auth listener in App.jsx
    } catch (err) {
      console.error('Login error:', err);
      // Make Firebase errors a bit more human readable
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError(err.message || 'Failed to authenticate.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app text-main flex flex-col items-center justify-center p-6 selection:bg-blue-500/30">
      <div className="w-full max-w-sm">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="bg-blue-600 p-4 rounded-2xl shadow-xl shadow-blue-600/20 mb-6">
            <ShieldAlert className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter uppercase text-center mb-2">CrisisBridge</h1>
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-dim">
            {targetRole === 'admin' ? 'HQ Command Login' : 'Responder Portal'}
          </h2>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="bg-surface border border-tactical rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
          
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-dim mb-2 pl-2">
                <Mail className="w-3 h-3" />
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-app border border-tactical rounded-2xl p-4 text-sm font-medium focus:outline-none focus:border-blue-500/50 transition-all text-main"
                placeholder="operator@crisisbridge.com"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-dim mb-2 pl-2">
                <Lock className="w-3 h-3" />
                Secure Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-app border border-tactical rounded-2xl p-4 text-sm font-medium focus:outline-none focus:border-blue-500/50 transition-all text-main"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
              <p className="text-xs font-bold text-red-500">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authenticating
              </>
            ) : (
              'Establish Link'
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-dim/50">
            Secure Tactical Network
          </p>
        </div>
      </div>
    </div>
  );
};
