import { useState, useEffect } from 'react';
import axios from 'axios';
import { Send, CheckCircle2, XCircle, History, Trash2, Loader2, Phone, MessageSquare, QrCode, RefreshCcw, Upload } from 'lucide-react';

function App() {
  // Web Token state
  const [webToken, setWebToken] = useState(() => localStorage.getItem('web-token') || '');
  const [tempToken, setTempToken] = useState('');

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [qrError, setQrError] = useState(null);

  // Pairing code state
  const [pairingMode, setPairingMode] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState(null);

  // Modal states
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  // Configure axios to always send token
  const axiosInstance = axios.create({
    headers: { 'x-web-token': webToken }
  });

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
    if (!webToken) {
      setIsCheckingStatus(false);
      return;
    }
    try {
      const res = await axiosInstance.get('/status');
      setIsConnected(res.data.connected);
      setQrError(null);
      
      if (!res.data.connected) {
        // Fetch QR if disconnected
        try {
          const qrRes = await axiosInstance.get('/qr');
          if (qrRes.data.success && qrRes.data.qr) {
            setQrCode(qrRes.data.qr);
          } else if (qrRes.data.error) {
             if (qrRes.data.error !== 'QR not ready yet') {
                 setQrError(qrRes.data.error);
             }
          }
        } catch (e) {
          console.log('Menunggu QR Code...');
        }
      }
    } catch (error) {
      console.error('Failed to check status', error);
      setIsConnected(false);
      if (error.response && error.response.status === 401) {
          handleLogout();
      }
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (webToken) {
        setIsCheckingStatus(true);
        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }
  }, [webToken]);

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
      
      const response = await axiosInstance.post('/send-message', {
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

  const handleClearHistory = () => {
    setShowClearModal(true);
  };

  const confirmClearHistory = () => {
    setHistory([]);
    setShowClearModal(false);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (tempToken.trim()) {
      const token = tempToken.trim();
      localStorage.setItem('web-token', token);
      setWebToken(token);
    }
  };

  const handleLogout = () => {
      setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
        await axiosInstance.post('/logout');
    } catch (e) {
        console.error('Logout failed', e);
    }
    localStorage.removeItem('web-token');
    setWebToken('');
    setIsConnected(false);
    setQrCode(null);
    setPairingMode(false);
    setPairingCode('');
    setShowLogoutModal(false);
  };

  const requestPairingCode = async (e) => {
      e.preventDefault();
      if (!pairingPhone) return;
      setPairingLoading(true);
      setPairingError(null);
      try {
          const res = await axiosInstance.post('/pairing-code', { phoneNumber: pairingPhone });
          if (res.data.success && res.data.code) {
              setPairingCode(res.data.code);
          } else {
              setPairingError(res.data.error || 'Gagal mendapatkan kode tautan.');
          }
      } catch (err) {
          setPairingError(err.response?.data?.error || 'Terjadi kesalahan jaringan.');
      } finally {
          setPairingLoading(false);
      }
  };

  // Token Login Screen
  if (!webToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex justify-center items-center font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-slate-100">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Phone className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Web Login</h2>
          <p className="text-sm text-slate-500 mb-6 text-center">
            Masukkan ID/Token sesi Anda. Token yang berbeda akan membuka ruang kerja WhatsApp yang terpisah.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Token Sesi</label>
              <input
                type="text"
                required
                placeholder="Contoh: KARYAWAN-1"
                className="block w-full rounded-xl border-slate-200 bg-slate-50 border p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors text-slate-900"
                value={tempToken}
                onChange={(e) => setTempToken(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Masuk ke Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

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
          <p className="text-sm text-slate-500 mb-6">
            {pairingMode 
                ? 'Masukkan nomor WhatsApp Anda untuk mendapatkan kode 8 digit.'
                : 'Buka WhatsApp di HP Anda > Perangkat Taut > Tautkan Perangkat, lalu scan QR ini.'
            }
          </p>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex justify-center items-center min-h-[250px]">
            {pairingMode ? (
                pairingCode ? (
                    <div className="text-center w-full">
                        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-semibold">Kode Tautan Anda</p>
                        <div className="text-3xl font-mono tracking-[0.2em] font-bold text-slate-800 bg-white p-4 rounded-xl border border-slate-200 shadow-inner">
                            {pairingCode.substring(0,4)}-{pairingCode.substring(4)}
                        </div>
                        <p className="text-xs text-slate-500 mt-4">Masukkan kode ini di aplikasi WhatsApp Anda.</p>
                    </div>
                ) : (
                    <form onSubmit={requestPairingCode} className="w-full">
                        <label className="block text-sm font-medium text-slate-700 text-left mb-1">Nomor WhatsApp</label>
                        <input
                            type="tel"
                            required
                            placeholder="Contoh: 628123456789"
                            className="block w-full rounded-xl border-slate-200 bg-white border p-3 focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-colors text-slate-900 mb-2"
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(e.target.value)}
                        />
                        {pairingError && <p className="text-xs text-red-500 text-left mb-3">{pairingError}</p>}
                        <button
                            type="submit"
                            disabled={pairingLoading}
                            className="w-full py-3 px-4 rounded-xl shadow-sm text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                        >
                            {pairingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                            Dapatkan Kode
                        </button>
                    </form>
                )
            ) : (
                qrError ? (
                    <div className="text-center text-red-500 flex flex-col items-center">
                        <XCircle className="w-8 h-8 mb-2" />
                        <span className="text-sm font-medium">{qrError}</span>
                    </div>
                ) : qrCode ? (
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 object-contain" />
                ) : (
                  <div className="text-center text-slate-400 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <span className="text-sm">Menghasilkan QR Code...</span>
                  </div>
                )
            )}
          </div>
          
          <div className="flex gap-2 mb-4">
              <button 
                onClick={() => { setPairingMode(!pairingMode); setPairingCode(''); setPairingError(null); }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                {pairingMode ? <QrCode className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                {pairingMode ? 'Kembali ke Scan QR' : 'Gunakan Nomor HP (Tautan)'}
              </button>
          </div>

          <div className="flex gap-2">
              <button 
                onClick={checkStatus}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <RefreshCcw className="w-4 h-4" />
                Muat Ulang
              </button>
              <button 
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-red-700 bg-red-100 hover:bg-red-200 transition-colors"
              >
                Ganti Token
              </button>
          </div>
        </div>

        {/* Logout Modal */}
        {showLogoutModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-100 transition-transform duration-300">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Konfirmasi Logout</h3>
              <p className="text-slate-500 text-sm mb-6">Apakah Anda yakin ingin mengganti token dan menutup sesi WhatsApp ini?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowLogoutModal(false)} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors">Batal</button>
                <button onClick={confirmLogout} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors shadow-sm shadow-red-200">Ya, Logout</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Messaging Screen
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
              <div className="w-12 h-12 bg-green-100 rounded-full flex justify-center items-center">
                  <Send className="w-6 h-6 text-green-600" />
              </div>
              <div>
                  <h1 className="text-xl font-bold text-slate-900">WhatsApp Sender</h1>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      Terhubung sebagai <span className="font-semibold text-slate-700">{webToken}</span>
                  </div>
              </div>
          </div>
          <button 
              onClick={handleLogout}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
          >
              Logout & Hapus Sesi
          </button>
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
                  onClick={handleClearHistory}
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

        {/* Modals for Messaging Screen */}
        {showLogoutModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-100 transition-transform duration-300">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                  <XCircle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Konfirmasi Logout</h3>
              <p className="text-slate-500 text-sm mb-6">Apakah Anda yakin ingin logout dan menghapus sesi Anda dari server?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowLogoutModal(false)} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors">Batal</button>
                <button onClick={confirmLogout} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors shadow-sm shadow-red-200">Ya, Logout</button>
              </div>
            </div>
          </div>
        )}

        {showClearModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-100 transition-transform duration-300">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-4">
                  <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Hapus Riwayat</h3>
              <p className="text-slate-500 text-sm mb-6">Semua riwayat pengiriman pesan akan dihapus permanen. Lanjutkan?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearModal(false)} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors">Batal</button>
                <button onClick={confirmClearHistory} className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition-colors shadow-sm shadow-orange-200">Ya, Hapus</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
