import { useState, useEffect } from 'react';
import axios from 'axios';
import { ShoppingCart, CheckCircle2, AlertTriangle } from 'lucide-react';

function App() {
  const [status, setStatus] = useState('Connecting...');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/v1/health')
      .then((res) => {
        setStatus(res.data.system);
        setIsConnected(true);
      })
      .catch(() => {
        setStatus('Backend Unreachable');
        setIsConnected(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center space-x-3 border-b pb-4">
          <div className="p-3 bg-emerald-600 text-white rounded-xl">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Mercado</h1>
            <p className="text-slate-500 text-sm">Agri-Market Price Forecasting Platform</p>
          </div>
        </header>

        <div className={`p-4 rounded-xl border flex items-center space-x-3 ${
          isConnected ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          {isConnected ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <AlertTriangle className="w-6 h-6 text-amber-600" />}
          <div>
            <span className="text-xs font-bold uppercase block">System Status</span>
            <span className="font-semibold">{status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
