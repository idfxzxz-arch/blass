import { useState, useEffect } from 'react';
import axios from 'axios';
import { Send, CheckCircle2, XCircle, History, Trash2, Loader2, Phone, MessageSquare, QrCode, RefreshCcw, Upload } from 'lucide-react';

function App() {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // Form state
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('wa-history');
    return saved ? JSON.parse(saved) : [];
  });

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('wa-history', JSON.stringify(history));
  }, [history]);

  // Check connection status and get QR code
  const checkStatus = async () => {
    try {
      const res = await axios.get('http://localhost:5000/status');
      setIsConnected(res.data.connected);
      
      if (!res.data.connected) {
        // Fetch QR if disconnected
        try {
          const qrRes = await axios.get('http://localhost:5000/qr');
          if (qrRes.data.success && qrRes.data.qr) {
            setQrCode(qrRes.data.qr);
          }
        } catch (e) {
          console.log('Menunggu QR Code...');
        }
      }
    } catch (error) {
      console.error('Failed to check status', error);
      setIsConnected(false);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // Poll status every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      setTo(prev => prev ? prev + '\n' + text : text);
    };
    reader.readAsText(file);
    e.target.value = null; // reset input
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!to || !message) {
      setNotification({ type: 'error', text: 'Mohon isi nomor tujuan dan pesan.' });
      return;
    }

    setLoading(true);
    setNotification(null);

    try {
      const numbers = to.split(/[\s,]+/).map(n => n.trim()).filter(n => n);
      
      const response = await axios.post('http://localhost:5000/send-message', {
        to: numbers,
        message
      });

      if (response.data.success) {
        setNotification({ type: 'success', text: `Berhasil mengirim ke ${response.data.results.filter(r => r.success).length} dari ${numbers.length} nomor.` });
        
        const newHistoryItem = {
          id: Date.now(),
          date: new Date().toISOString(),
          numbers,
          message,
          results: response.data.results
        };
        setHistory(prev => [newHistoryItem, ...prev]);
        
        setTo('');
        setMessage('');
      } else {
        setNotification({ type: 'error', text: response.data.error || 'Terjadi kesalahan saat mengirim pesan.' });
      }
    } catch (error) {
      const errMsg = error.response?.data?.error || error.message;
      setNotification({ type: 'error', text: `Gagal mengirim pesan: ${errMsg}` });
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    if (confirm('Hapus semua riwayat pesan?')) {
      setHistory([]);
    }
  };

  // Loading Screen
  if (isCheckingStatus && !qrCode && !isConnected) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center font-sans">
        <Loader2 className="w-12 h-12 animate-spin text-green-500 mb-4" />
        <p className="text-slate-600 font-medium">Menghubungkan ke server...</p>
      </div>
    );
  }

  // QR Login Screen
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-50 flex justify-center items-center font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-slate-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <QrCode className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Login WhatsApp</h2>
          <p className="text-sm text-slate-500 mb-8">
            Buka WhatsApp di HP Anda &gt; Perangkat Taut &gt; Tautkan Perangkat, lalu scan QR ini.
          </p>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex justify-center items-center min-h-[250px]">
            {qrCode ? (
              <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 object-contain" />
            ) : (
              <div className="text-center text-slate-400 flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <span className="text-sm">Menghasilkan QR Code...</span>
              </div>
            )}
          </div>
          
          <button 
            onClick={checkStatus}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Muat Ulang Status
          </button>
        </div>
      </div>
    );
  }

  // Messaging Screen
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight flex items-center justify-center gap-3">
            <Send className="w-10 h-10 text-green-500" />
            WhatsApp Sender
          </h1>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Terhubung ke WhatsApp
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Main Form */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-500" />
                Buat Pesan Baru
              </h2>
              
              {notification && (
                <div className={`p-4 mb-6 rounded-lg flex gap-3 text-sm font-medium ${
                  notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  {notification.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="to" className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      Nomor Tujuan
                    </label>
                    <div>
                      <input 
                        type="file" 
                        id="file-upload" 
                        accept=".txt,.csv" 
                        className="hidden" 
                        onChange={handleFileUpload}
                        disabled={loading}
                      />
                      <label 
                        htmlFor="file-upload" 
                        className="cursor-pointer text-xs flex items-center gap-1 text-green-600 hover:text-green-700 font-medium bg-green-50 px-2 py-1 rounded border border-green-200 hover:bg-green-100 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Import TXT/CSV
                      </label>
                    </div>
                  </div>
                  <textarea
                    id="to"
                    rows={3}
                    className="block w-full rounded-xl border-slate-200 bg-slate-50 border p-3 focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-colors text-slate-900 placeholder:text-slate-400 text-sm"
                    placeholder="08123456789, 628987654321&#10;(Pisahkan dengan koma atau baris baru)"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-slate-500">Otomatis diformat ke format WhatsApp. Mendukung banyak nomor.</p>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1">
                    Isi Pesan
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    className="block w-full rounded-xl border-slate-200 bg-slate-50 border p-3 focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-colors text-slate-900 placeholder:text-slate-400 text-sm"
                    placeholder="Ketik pesan WhatsApp Anda di sini..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Mengirim...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Kirim Pesan
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* History */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col h-[600px] overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-green-500" />
                Riwayat
              </h2>
              {history.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors tooltip"
                  title="Hapus riwayat"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                  <History className="w-12 h-12 opacity-20" />
                  <p className="text-sm">Belum ada pesan yang dikirim.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          {new Date(item.date).toLocaleString('id-ID')}
                        </span>
                        <div className="flex -space-x-1">
                          {item.results.map((r, i) => (
                            <div 
                              key={i} 
                              className={`w-4 h-4 rounded-full border-2 border-white ${r.success ? 'bg-green-500' : 'bg-red-500'}`}
                              title={`${r.number}: ${r.success ? 'Sukses' : 'Gagal'}`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-slate-800 line-clamp-2 mb-2 font-medium">"{item.message}"</p>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-1">
                        Dikirim ke: {item.numbers.slice(0, 3).map(n => (
                           <span key={n} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{n}</span>
                        ))}
                        {item.numbers.length > 3 && <span className="text-slate-400">+{item.numbers.length - 3} lagi</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

export default App;
