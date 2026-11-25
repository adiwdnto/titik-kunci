import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Bike, Check, ChevronRight, CircleHelp, ClipboardList,
  Gauge, LocateFixed, LockKeyhole, LogOut,
  MapPin, Menu, Navigation, Phone, Plus, RefreshCw, ShieldCheck, Siren, Store,
  UserRound, Users, Wallet, Wrench, X,
} from 'lucide-react';
import L from 'leaflet';
import {
  CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents,
} from 'react-leaflet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const CITY_CENTER = [-2.117, 106.109];
const TOKEN_KEY = 'titik-kunci-token';

async function apiRequest(path, options = {}, token = localStorage.getItem(TOKEN_KEY)) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Permintaan gagal (${response.status}).`);
  return body;
}

const money = (amount) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Number(amount || 0));

const roleLabel = {
  PEMILIK: 'Pemilik kendaraan',
  ADMIN_BENGKEL: 'Admin bengkel',
  SUPER_ADMIN: 'Super admin',
};

const statusLabel = {
  PENDING: 'Menunggu montir',
  DITERIMA: 'Diterima',
  DALAM_PERJALANAN: 'Montir menuju lokasi',
  SEDANG_DIKERJAKAN: 'Sedang dikerjakan',
  SELESAI: 'Selesai',
  DIBATALKAN: 'Dibatalkan',
  SIAGA: 'Siaga',
  SIBUK: 'Sedang bertugas',
  OFFLINE: 'Offline',
};

const statusTone = {
  PENDING: 'amber', DITERIMA: 'blue', DALAM_PERJALANAN: 'blue',
  SEDANG_DIKERJAKAN: 'blue', SELESAI: 'green', DIBATALKAN: 'gray',
  SIAGA: 'green', SIBUK: 'amber', OFFLINE: 'gray',
};

function pinIcon(kind) {
  const glyph = kind === 'workshop' ? 'W' : kind === 'mechanic' ? 'M' : 'S';
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<span class="map-pin map-pin-${kind}"><b>${glyph}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 38],
    popupAnchor: [0, -36],
  });
}

function MapClickTarget({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 14), { animate: true });
  }, [center, map]);
  return null;
}

function LocationMap({ catalog, selectedLocation, route = [], onPick, interactive = false, compact = false }) {
  const points = useMemo(() => [
    ...(catalog?.workshops || []).map((item) => ({ ...item, kind: 'workshop', title: item.workshop_name })),
    ...(catalog?.mechanics || []).map((item) => ({ ...item, kind: 'mechanic', title: item.full_name })),
    ...(catalog?.stores || []).map((item) => ({ ...item, kind: 'store', title: item.store_name })),
  ].filter((item) => item.location), [catalog]);
  const center = selectedLocation ? [selectedLocation.lat, selectedLocation.lng] : CITY_CENTER;

  return (
    <MapContainer
      center={CITY_CENTER}
      zoom={13}
      scrollWheelZoom
      zoomControl={false}
      className={`service-map ${compact ? 'service-map-compact' : ''}`}
    >
      <MapRecenter center={selectedLocation} />
      {interactive && <MapClickTarget onPick={onPick} />}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point) => (
        <Marker
          key={`${point.kind}-${point.mechanic_id || point.workshop_id || point.store_id}`}
          position={[point.location.lat, point.location.lng]}
          icon={pinIcon(point.kind)}
        >
          <Popup>
            <strong>{point.title}</strong>
            <br />
            {point.kind === 'mechanic'
              ? statusLabel[point.status_active] || point.status_active
              : point.address || point.phone_number}
          </Popup>
        </Marker>
      ))}
      {selectedLocation && (
        <CircleMarker center={[selectedLocation.lat, selectedLocation.lng]} radius={9} pathOptions={{
          color: '#171a1c', weight: 3, fillColor: '#f0c84b', fillOpacity: 1,
        }}>
          <Popup>Titik kendaraan Anda</Popup>
        </CircleMarker>
      )}
      {route.length > 1 && (
        <Polyline positions={route.map(({ lat, lng }) => [lat, lng])} pathOptions={{
          color: '#1e7772', weight: 5, opacity: 0.9,
        }} />
      )}
    </MapContainer>
  );
}

function Brand({ inverse = false }) {
  return (
    <div className={`brand ${inverse ? 'brand-inverse' : ''}`}>
      <span className="brand-mark"><Wrench size={20} strokeWidth={2.7} /></span>
      <span className="brand-word">titik<span>kunci</span><small>BANTUAN KENDARAAN</small></span>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${statusTone[status] || 'gray'}`}>
    <i />{statusLabel[status] || status}
  </span>;
}

function LoginScreen({ onLogin, onRegister, busy, error }) {
  const [registerMode, setRegisterMode] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', password: '' });
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      if (registerMode) await onRegister(form);
      else await onLogin(form);
    } catch (requestError) {
      setFormError(requestError.message);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <Brand inverse />
        <div className="showcase-copy">
          <span className="eyebrow eyebrow-light"><span className="live-dot" /> PANGKALPINANG & BALUNIJUK</span>
          <h1>Jalan boleh jauh.<br /><em>Bantuan dekat.</em></h1>
          <p>Montir siaga, titik lokasi akurat, dan estimasi biaya yang jelas. Semua dimulai dari satu sentuhan.</p>
        </div>
        <div className="showcase-road" aria-hidden="true">
          <div className="road-line" />
          <div className="road-pin road-pin-one"><Wrench size={18} /></div>
          <div className="road-pin road-pin-two"><MapPin size={18} /></div>
          <div className="road-distance">2,4 KM <span>EST. JARAK</span></div>
        </div>
        <div className="showcase-foot"><span>01</span> Layanan darurat, tanpa drama.</div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-heading">
            <span className="eyebrow">{registerMode ? 'MULAI PERJALANAN' : 'SELAMAT DATANG KEMBALI'}</span>
            <h2>{registerMode ? <>Buat akun<br />Titik Kunci.</> : <>Ada kendala?<br />Kita bantu.</>}</h2>
            <p>{registerMode ? 'Daftar sebagai pemilik kendaraan untuk memanggil montir di sekitar Anda.' : 'Masuk untuk melihat layanan dan melanjutkan perjalanan.'}</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {registerMode && (
              <label className="field">
                <span>Nama lengkap</span>
                <div className="input-shell"><UserRound size={17} /><input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Nama Anda" /></div>
              </label>
            )}
            <label className="field">
              <span>Nomor telepon</span>
              <div className="input-shell"><Phone size={17} /><input required autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xx xxxx xxxx" /></div>
            </label>
            <label className="field">
              <span>Kata sandi</span>
              <div className="input-shell"><LockKeyhole size={17} /><input required minLength={registerMode ? 10 : undefined} type={showPassword ? 'text' : 'password'} autoComplete={registerMode ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={registerMode ? 'Minimal 10 karakter' : 'Masukkan kata sandi'} /><button className="input-action" type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Sembunyikan' : 'Lihat'}</button></div>
            </label>
            {(formError || error) && <div className="inline-error" role="alert">{formError || error}</div>}
            <button className="button button-dark auth-submit" disabled={busy}>
              {busy ? 'Memproses...' : registerMode ? 'Buat akun' : 'Masuk'} <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-switch">
            {registerMode ? 'Sudah punya akun?' : 'Belum terdaftar?'}
            <button type="button" onClick={() => { setFormError(''); setRegisterMode(!registerMode); }}>
              {registerMode ? 'Masuk di sini' : 'Buat akun pemilik'}
            </button>
          </div>
          <div className="demo-hint">
            <ShieldCheck size={16} />
            <span>Akun demo untuk presentasi tersedia di README proyek.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone = 'gold' }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-top"><span className="metric-icon"><Icon size={18} /></span><span className="metric-detail">{detail}</span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </article>
  );
}

function OrderCard({ order, role, mechanics = [], onStatus, onPayment, onAssign, onShowMap, busyOrder }) {
  const [mechanicId, setMechanicId] = useState('');
  const eligibleMechanics = mechanics.filter((mechanic) =>
    Number(mechanic.workshop_id) === Number(order.workshop_id) && mechanic.status_active === 'SIAGA');
  const nextStatus = {
    PENDING: ['DITERIMA', 'DIBATALKAN'],
    DITERIMA: ['DALAM_PERJALANAN', 'DIBATALKAN'],
    DALAM_PERJALANAN: ['SEDANG_DIKERJAKAN', 'DIBATALKAN'],
    SEDANG_DIKERJAKAN: ['SELESAI'],
  }[order.order_status] || [];
  const date = new Date(order.created_at).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return (
    <article className="order-card">
      <div className="order-card-head">
        <div className="order-id"><span className="order-siren"><Siren size={16} /></span><div><strong>TK-{String(order.order_id).padStart(4, '0')}</strong><small>{date}</small></div></div>
        <StatusBadge status={order.order_status} />
      </div>
      <p className="order-issue">{order.issue_description}</p>
      <div className="order-meta">
        {role !== 'PEMILIK' && <span><UserRound size={14} />{order.customer_name || 'Pemilik kendaraan'}</span>}
        {order.mechanic_name && <span><Wrench size={14} />{order.mechanic_name}</span>}
        {order.plate_number && <span><Bike size={14} />{order.brand} {order.model} · {order.plate_number}</span>}
        <span><Navigation size={14} />{Number(order.distance_km || 0).toFixed(1)} km {order.route_source === 'OSRM' ? 'rute jalan' : 'estimasi'}</span>
      </div>
      <div className="order-bottom"><div><small>Estimasi layanan</small><strong>{money(order.total_cost)}</strong></div><div className="payment-state">{order.payment_status === 'TERCATAT' ? <span className="paid"><Check size={13} /> Tunai tercatat</span> : <span>Tunai · belum dibayar</span>}</div></div>
      {order.cancellation_reason && <p className="cancel-reason">Catatan: {order.cancellation_reason}</p>}
      {order.route?.length > 1 && <button className="text-button order-map-button" onClick={() => onShowMap(order.order_id)}><Navigation size={14} /> Lihat lokasi & rute</button>}
      {role === 'PEMILIK' && ['PENDING', 'DITERIMA'].includes(order.order_status) && (
        <button className="button button-quiet button-small" disabled={busyOrder === order.order_id} onClick={() => onStatus(order.order_id, 'DIBATALKAN')}>Batalkan pesanan</button>
      )}
      {role !== 'PEMILIK' && nextStatus.length > 0 && (
        <div className="order-actions">
          {nextStatus.map((status) => (
            <button key={status} className={`button ${status === 'DIBATALKAN' ? 'button-quiet' : 'button-dark'} button-small`} disabled={busyOrder === order.order_id} onClick={() => onStatus(order.order_id, status)}>
              {status === 'DITERIMA' ? 'Terima permintaan' : status === 'DALAM_PERJALANAN' ? 'Berangkat' : status === 'SEDANG_DIKERJAKAN' ? 'Mulai perbaikan' : status === 'SELESAI' ? 'Tandai selesai' : 'Tolak / batalkan'}
            </button>
          ))}
        </div>
      )}
      {role !== 'PEMILIK' && !order.mechanic_id && order.workshop_id && ['PENDING', 'DITERIMA'].includes(order.order_status) && (
        <div className="assign-row">
          {eligibleMechanics.length > 0 ? <>
            <select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)} aria-label="Pilih montir siaga">
              <option value="">Pilih montir siaga</option>
              {eligibleMechanics.map((mechanic) => <option key={mechanic.mechanic_id} value={mechanic.mechanic_id}>{mechanic.full_name}</option>)}
            </select>
            <button className="button button-outline button-small" disabled={!mechanicId || busyOrder === order.order_id} onClick={() => onAssign(order.order_id, mechanicId)}>Tetapkan montir</button>
          </> : <span>Tambahkan montir siaga untuk menetapkan petugas.</span>}
        </div>
      )}
      {role !== 'PEMILIK' && order.order_status === 'SELESAI' && order.payment_status !== 'TERCATAT' && (
        <button className="button button-quiet button-small" disabled={busyOrder === order.order_id} onClick={() => onPayment(order.order_id)}>
          <Wallet size={15} /> Catat pembayaran tunai
        </button>
      )}
    </article>
  );
}

function EmptyState({ icon: Icon = ClipboardList, title, description }) {
  return <div className="empty-state"><span><Icon size={22} /></span><strong>{title}</strong><p>{description}</p></div>;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [account, setAccount] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [zones, setZones] = useState([]);
  const [summary, setSummary] = useState({});
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [activeView, setActiveView] = useState('dashboard');
  const [busyOrder, setBusyOrder] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ brand: '', model: '', plateNumber: '' });
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showMechanicForm, setShowMechanicForm] = useState(false);
  const [mechanicForm, setMechanicForm] = useState({ fullName: '', phone: '', workshopId: '' });
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceForm, setServiceForm] = useState({ serviceName: '', description: '', basePrice: '' });
  const [workshopForm, setWorkshopForm] = useState(null);
  const [zoneDrafts, setZoneDrafts] = useState({});
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    apiRequest('/auth/me', {}, token)
      .then(({ account: current }) => { if (active) setAccount(current); })
      .catch((error) => {
        localStorage.removeItem(TOKEN_KEY);
        if (active) {
          setToken(null);
          setAccount(null);
          setGlobalError(error.message);
        }
      })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, [token]);

  const loadData = useCallback(async () => {
    if (!account) return;
    setLoadingData(true);
    setGlobalError('');
    try {
      const base = [
        apiRequest('/catalog'),
        apiRequest('/orders'),
      ];
      if (account.role === 'PEMILIK') base.push(apiRequest('/vehicles'));
      else {
        base.push(apiRequest('/admin/summary'));
        base.push(apiRequest('/admin/workshops'));
        base.push(apiRequest('/admin/mechanics'));
        if (account.role === 'SUPER_ADMIN') base.push(apiRequest('/admin/zones'));
      }
      const results = await Promise.all(base);
      setCatalog(results[0]);
      setOrders(results[1].orders);
      setSelectedOrderId((current) => current && results[1].orders.some((order) => order.order_id === current)
        ? current
        : results[1].orders[0]?.order_id || null);
      if (account.role === 'PEMILIK') {
        setVehicles(results[2].vehicles);
      } else {
        setSummary(results[2]);
        setWorkshops(results[3].workshops);
        setMechanics(results[4].mechanics);
        if (account.role === 'SUPER_ADMIN') {
          setZones(results[5].zones);
          setZoneDrafts(Object.fromEntries(results[5].zones.map((zone) => [zone.zone_id, {
            baseRate: zone.base_rate, ratePerKm: zone.rate_per_km,
          }])));
        }
        const ownWorkshop = results[3].workshops[0];
        if (ownWorkshop) {
          setWorkshopForm({
            workshopId: ownWorkshop.workshop_id,
            workshopName: ownWorkshop.workshop_name,
            phone: ownWorkshop.phone_number,
            address: ownWorkshop.address,
            lat: ownWorkshop.location?.lat ?? CITY_CENTER[0],
            lng: ownWorkshop.location?.lng ?? CITY_CENTER[1],
          });
        }
      }
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setLoadingData(false);
    }
  }, [account]);

  useEffect(() => {
    loadData();
    const interval = window.setInterval(loadData, 45000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (!account || account.role !== 'PEMILIK' || !selectedLocation) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    let active = true;
    setQuote(null);
    setQuoteError('');
    const timer = setTimeout(() => {
      apiRequest(`/quote?lat=${encodeURIComponent(selectedLocation.lat)}&lng=${encodeURIComponent(selectedLocation.lng)}`)
        .then((result) => { if (active) setQuote(result); })
        .catch((error) => { if (active) setQuoteError(error.message); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [account, selectedLocation]);

  async function signIn(form) {
    setBusy(true);
    setGlobalError('');
    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST', body: JSON.stringify({ phone: form.phone, password: form.password }),
      }, null);
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setAccount(result.account);
    } catch (error) {
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function signUp(form) {
    setBusy(true);
    try {
      const result = await apiRequest('/auth/register', {
        method: 'POST', body: JSON.stringify(form),
      }, null);
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setAccount(result.account);
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAccount(null);
    setOrders([]);
    setCatalog(null);
    setActiveView('dashboard');
    setGlobalError('');
  }

  async function locateMe() {
    if (!navigator.geolocation) {
      setQuoteError('Browser ini tidak mendukung akses lokasi. Klik langsung di peta untuk memilih titik.');
      return;
    }
    setQuoteError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setSelectedLocation({ lat: coords.latitude, lng: coords.longitude }),
      () => setQuoteError('Lokasi tidak dapat diakses. Izinkan lokasi atau pilih titik secara manual di peta.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!selectedLocation) {
      setQuoteError('Pilih titik kendaraan dengan menekan peta atau tombol lokasi.');
      return;
    }
    if (!issueDescription.trim()) {
      setQuoteError('Jelaskan kendala kendaraan agar montir dapat bersiap.');
      return;
    }
    setBusy(true);
    setQuoteError('');
    try {
      await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          issueDescription,
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          vehicleId: selectedVehicle || null,
        }),
      });
      setIssueDescription('');
      setActiveView('orders');
      await loadData();
    } catch (error) {
      setQuoteError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeOrderStatus(orderId, status) {
    setBusyOrder(orderId);
    setGlobalError('');
    try {
      await apiRequest(`/orders/${orderId}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setBusyOrder(null);
    }
  }

  async function recordPayment(orderId) {
    setBusyOrder(orderId);
    setGlobalError('');
    try {
      await apiRequest(`/orders/${orderId}/payment`, { method: 'PATCH' });
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setBusyOrder(null);
    }
  }

  async function assignMechanic(orderId, mechanicId) {
    setBusyOrder(orderId);
    setGlobalError('');
    try {
      await apiRequest(`/orders/${orderId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ mechanicId }),
      });
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setBusyOrder(null);
    }
  }

  async function addVehicle(event) {
    event.preventDefault();
    try {
      const result = await apiRequest('/vehicles', {
        method: 'POST', body: JSON.stringify(vehicleForm),
      });
      setVehicles((current) => [...current, result.vehicle]);
      setSelectedVehicle(String(result.vehicle.vehicle_id));
      setVehicleForm({ brand: '', model: '', plateNumber: '' });
      setShowVehicleForm(false);
    } catch (error) {
      setGlobalError(error.message);
    }
  }

  async function addMechanic(event) {
    event.preventDefault();
    try {
      await apiRequest('/admin/mechanics', {
        method: 'POST',
        body: JSON.stringify({
          ...mechanicForm,
          workshopId: mechanicForm.workshopId || account.workshop_id,
        }),
      });
      setMechanicForm({ fullName: '', phone: '', workshopId: '' });
      setShowMechanicForm(false);
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    }
  }

  async function addWorkshopService(event) {
    event.preventDefault();
    try {
      await apiRequest('/admin/services', {
        method: 'POST',
        body: JSON.stringify({
          ...serviceForm,
          workshopId: account.workshop_id,
        }),
      });
      setServiceForm({ serviceName: '', description: '', basePrice: '' });
      setShowServiceForm(false);
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    }
  }

  async function saveWorkshop(event) {
    event.preventDefault();
    if (!workshopForm?.workshopId) return;
    try {
      await apiRequest(`/admin/workshops/${workshopForm.workshopId}`, {
        method: 'PATCH',
        body: JSON.stringify(workshopForm),
      });
      setGlobalError('');
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    }
  }

  async function updateMechanic(mechanicId, status) {
    try {
      await apiRequest(`/admin/mechanics/${mechanicId}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    }
  }

  async function saveZone(zoneId) {
    const draft = zoneDrafts[zoneId];
    try {
      await apiRequest(`/admin/zones/${zoneId}`, {
        method: 'PATCH', body: JSON.stringify(draft),
      });
      setGlobalError('');
      await loadData();
    } catch (error) {
      setGlobalError(error.message);
    }
  }

  if (authLoading) return <div className="loading-screen"><span className="loading-mark"><Wrench size={24} /></span><p>Menghubungkan perjalanan...</p></div>;
  if (!account) return <LoginScreen onLogin={signIn} onRegister={signUp} busy={busy} error={globalError} />;

  const isOwner = account.role === 'PEMILIK';
  const isSuper = account.role === 'SUPER_ADMIN';
  const pendingOrders = orders.filter((order) => !['SELESAI', 'DIBATALKAN'].includes(order.order_status));
  const selectedOrder = orders.find((order) => order.order_id === selectedOrderId) || orders[0];
  const mapRoute = quote?.route?.length ? quote.route : (activeView === 'orders' ? selectedOrder?.route || [] : []);
  const mapLocation = activeView === 'orders' && selectedOrder?.incidentLocation
    ? selectedOrder.incidentLocation
    : selectedLocation;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand-link" href="#" onClick={(event) => { event.preventDefault(); setActiveView('dashboard'); }}><Brand /></a>
        <nav className={`top-nav ${mobileMenu ? 'top-nav-open' : ''}`}>
          <button className={activeView === 'dashboard' ? 'nav-active' : ''} onClick={() => { setActiveView('dashboard'); setMobileMenu(false); }}>{isOwner ? 'Panggil montir' : 'Ringkasan'}</button>
          <button className={activeView === 'orders' ? 'nav-active' : ''} onClick={() => { setActiveView('orders'); setMobileMenu(false); }}>Pesanan <span className="nav-count">{pendingOrders.length}</span></button>
          <button className={activeView === 'operations' ? 'nav-active' : ''} onClick={() => { setActiveView('operations'); setMobileMenu(false); }}>{isOwner ? 'Kendaraan' : isSuper ? 'Kelola sistem' : 'Operasional'}</button>
        </nav>
        <div className="top-actions">
          <button className="icon-button refresh-button" title="Muat ulang data" onClick={loadData} disabled={loadingData}><RefreshCw size={17} className={loadingData ? 'spin' : ''} /></button>
          <div className="account-chip"><span className="account-avatar">{account.full_name?.slice(0, 1).toUpperCase() || 'T'}</span><div><strong>{account.full_name}</strong><small>{roleLabel[account.role]}</small></div></div>
          <button className="icon-button logout-button" title="Keluar" onClick={signOut}><LogOut size={17} /></button>
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Buka navigasi">{mobileMenu ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </header>

      <main className="workspace">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{isOwner ? 'TITIK LAYANAN ANDA' : isSuper ? 'PUSAT KENDALI' : 'DASHBOARD BENGKEL'}</span>
            <h1>{activeView === 'orders' ? <>Pesanan <em>layanan.</em></> : activeView === 'operations' ? (isOwner ? <>Kendaraan <em>saya.</em></> : <>Kelola <em>operasional.</em></>) : isOwner ? <>Jangan panik.<br className="mobile-break" /> <em>Montir meluncur.</em></> : <>Semua layanan,<br className="mobile-break" /> <em>terpantau.</em></>}</h1>
            <p>{activeView === 'orders' ? 'Pantau progres bantuan dan catatan biaya Anda.' : isOwner ? 'Bagikan titik mogok, kami carikan bantuan terdekat.' : `Halo ${account.full_name?.split(' ')[0]}, berikut kondisi layanan hari ini.`}</p>
          </div>
          <div className="heading-side">
            <span className="service-open"><i /> LAYANAN AKTIF</span>
            <span className="heading-date">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
        </section>

        {globalError && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{globalError}</span><button onClick={() => setGlobalError('')} aria-label="Tutup"><X size={16} /></button></div>}

        {activeView === 'dashboard' && isOwner && (
          <>
            <section className="owner-grid">
              <article className="panel map-panel">
                <div className="panel-heading map-panel-heading">
                  <div><span className="section-index">01 / PETA</span><h2>Tentukan titik <em>kendaraan.</em></h2></div>
                  <button className="button button-outline button-small" onClick={locateMe}><LocateFixed size={15} /> Gunakan lokasi saya</button>
                </div>
                <div className="map-frame">
                  {catalog ? <LocationMap catalog={catalog} selectedLocation={selectedLocation} route={mapRoute} onPick={setSelectedLocation} interactive /> : <div className="map-loading">Memuat peta dan bengkel...</div>}
                  <div className="map-hint"><MapPin size={14} /> {selectedLocation ? `${selectedLocation.lat.toFixed(5)}, ${selectedLocation.lng.toFixed(5)}` : 'Klik peta untuk memilih titik mogok'}</div>
                  <div className="map-legend"><span><i className="legend-workshop" /> Bengkel</span><span><i className="legend-mechanic" /> Montir</span><span><i className="legend-store" /> Sparepart</span></div>
                </div>
                <div className="map-footer"><span><span className="live-dot" /> Peta layanan lokal</span><span>OpenStreetMap · Pangkalpinang</span></div>
              </article>

              <article className="panel request-panel">
                <div className="panel-heading request-heading">
                  <div><span className="section-index">02 / PERMINTAAN</span><h2>Panggil <em>bantuan.</em></h2></div>
                  <span className="request-number">01</span>
                </div>
                <form onSubmit={submitOrder} className="request-form">
                  <label className="field">
                    <span>Kendaraan <small>OPSIONAL</small></span>
                    <select value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)}>
                      <option value="">Pilih kendaraan</option>
                      {vehicles.map((vehicle) => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.brand} {vehicle.model} · {vehicle.plate_number}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Jelaskan kendala</span>
                    <textarea rows="3" maxLength="500" required value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="Contoh: mesin mati mendadak, ban bocor..." />
                    <small className="field-help">{issueDescription.length}/500 karakter</small>
                  </label>
                  <div className="quote-box">
                    <div className="quote-icon"><Navigation size={17} /></div>
                    <div className="quote-content">
                      <strong>{quote?.mechanic ? `Montir · ${quote.mechanic.full_name}` : quote ? 'Belum ada montir siaga' : 'Estimasi perjalanan'}</strong>
                      <span>{quote ? quote.mechanic ? `${quote.distance_km} km · rute jalan OSRM` : `Antrean · ${quote.workshop_name || 'bengkel terdekat'}` : quoteError || 'Pilih lokasi untuk menghitung jarak & biaya'}</span>
                    </div>
                    <div className="quote-price">{quote ? money(quote.total_cost) : '—'}</div>
                  </div>
                  {quoteError && <div className="inline-error">{quoteError}</div>}
                  <div className="payment-note"><Wallet size={15} /><span>Bayar tunai setelah layanan selesai.</span></div>
                  <button className="button button-yellow request-submit" disabled={busy || !selectedLocation || !quote}>
                    <Siren size={17} /> {busy ? 'Mengirim permintaan...' : 'Panggil montir'} <ArrowRight size={17} />
                  </button>
                </form>
                <div className="request-foot"><ShieldCheck size={14} /> Estimasi dihitung dari zona dan rute jalan.</div>
              </article>
            </section>

            <section className="below-grid">
              <article className="panel nearby-panel">
                <div className="panel-heading"><div><span className="section-index">DI SEKITAR ANDA</span><h2>Titik <em>bantuan.</em></h2></div><span className="small-count">{(catalog?.workshops?.length || 0) + (catalog?.stores?.length || 0)} LOKASI</span></div>
                <div className="nearby-list">
                  {(catalog?.workshops || []).slice(0, 3).map((workshop) => (
                    <div className="nearby-item" key={workshop.workshop_id}><span className="nearby-icon workshop-icon"><Wrench size={16} /></span><div><strong>{workshop.workshop_name}</strong><small>{workshop.address}</small></div><span className="open-tag">AKTIF</span></div>
                  ))}
                  {(catalog?.workshops || []).length === 0 && <EmptyState icon={Store} title="Belum ada bengkel" description="Bengkel layanan belum tersedia di area ini." />}
                </div>
              </article>
              <article className="panel recent-panel">
                <div className="panel-heading"><div><span className="section-index">AKTIVITAS</span><h2>Permintaan <em>terakhir.</em></h2></div><button className="text-button" onClick={() => setActiveView('orders')}>Semua pesanan <ChevronRight size={15} /></button></div>
                {orders.length ? <div className="recent-order"><span className="recent-order-icon"><ClipboardList size={17} /></span><div><strong>TK-{String(orders[0].order_id).padStart(4, '0')} · {orders[0].issue_description}</strong><small>{new Date(orders[0].created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</small></div><StatusBadge status={orders[0].order_status} /></div> : <EmptyState icon={ClipboardList} title="Belum ada permintaan" description="Permintaan bantuan Anda akan tercatat di sini." />}
              </article>
            </section>
          </>
        )}

        {activeView === 'dashboard' && !isOwner && (
          <>
            <section className="metrics-grid">
              <MetricCard icon={Store} label="Bengkel terdaftar" value={summary.workshops ?? '—'} detail="AREA LAYANAN" />
              <MetricCard icon={Users} label="Montir terdata" value={summary.mechanics ?? '—'} detail="SEMUA STATUS" tone="blue" />
              <MetricCard icon={ClipboardList} label="Total pesanan" value={summary.orders ?? '—'} detail="SELURUH WAKTU" tone="green" />
              <MetricCard icon={Activity} label="Pesanan aktif" value={summary.activeOrders ?? '—'} detail="PERLU TINDAKAN" tone="dark" />
            </section>
            <section className="admin-dashboard-grid">
              <article className="panel admin-map-panel">
                <div className="panel-heading"><div><span className="section-index">JARINGAN LAYANAN</span><h2>Peta <em>operasional.</em></h2></div><span className="service-open"><i /> LIVE</span></div>
                <div className="map-frame admin-map-frame">{catalog ? <LocationMap catalog={catalog} compact /> : <div className="map-loading">Memuat peta...</div>}</div>
                <div className="admin-map-foot"><span><span className="live-dot" /> Pangkalpinang · Balunijuk</span><button className="text-button" onClick={() => setActiveView('operations')}>Kelola titik <ChevronRight size={15} /></button></div>
              </article>
              <article className="panel inbox-panel">
                <div className="panel-heading"><div><span className="section-index">PERLU TINDAKAN</span><h2>Antrean <em>bantuan.</em></h2></div><span className="small-count">{pendingOrders.length} AKTIF</span></div>
                {pendingOrders.slice(0, 3).map((order) => (
                  <div className="inbox-row" key={order.order_id}><span className="inbox-pulse"><Siren size={15} /></span><div><strong>{order.issue_description}</strong><small>TK-{String(order.order_id).padStart(4, '0')} · {order.customer_name || 'Pemilik'}</small></div><StatusBadge status={order.order_status} /></div>
                ))}
                {pendingOrders.length === 0 && <EmptyState icon={Check} title="Antrean kosong" description="Semua permintaan aktif sudah ditangani." />}
                {pendingOrders.length > 0 && <button className="button button-dark inbox-link" onClick={() => setActiveView('orders')}>Buka antrean <ArrowRight size={16} /></button>}
              </article>
            </section>
          </>
        )}

        {activeView === 'orders' && (
          <section className="orders-layout">
            <div className="orders-main">
              <div className="list-heading"><div><span className="section-index">RIWAYAT & STATUS</span><h2>{isOwner ? 'Perjalanan bantuan.' : 'Antrean layanan.'}</h2></div><span className="small-count">{orders.length} PESANAN</span></div>
              {orders.length ? orders.map((order) => (
                <OrderCard key={order.order_id} order={order} role={account.role} mechanics={mechanics} onStatus={changeOrderStatus} onPayment={recordPayment} onAssign={assignMechanic} onShowMap={setSelectedOrderId} busyOrder={busyOrder} />
              )) : <EmptyState title="Belum ada pesanan" description={isOwner ? 'Panggil montir, lalu progresnya bisa dipantau di halaman ini.' : 'Pesanan pelanggan akan muncul di halaman ini.'} />}
            </div>
            <aside className="panel orders-map-aside">
              <div className="panel-heading"><div><span className="section-index">LOKASI LAYANAN</span><h2>Peta <em>area.</em></h2></div></div>
              <div className="map-frame orders-map-frame">{catalog ? <LocationMap catalog={catalog} selectedLocation={mapLocation} route={mapRoute} compact /> : <div className="map-loading">Memuat peta...</div>}</div>
              <div className="aside-note"><Navigation size={15} /> Rute ditampilkan sesuai pesanan yang dipilih.</div>
              {isOwner && <div className="aside-info"><span className="info-icon"><Wallet size={17} /></span><div><strong>Pembayaran tunai</strong><p>Bayar langsung setelah bantuan selesai. Riwayat biaya tersimpan di sini.</p></div></div>}
            </aside>
          </section>
        )}

        {activeView === 'operations' && isOwner && (
          <section className="operations-grid">
            <article className="panel vehicle-panel">
              <div className="panel-heading"><div><span className="section-index">GARASI SAYA</span><h2>Kendaraan <em>terdaftar.</em></h2></div><button className="button button-dark button-small" onClick={() => setShowVehicleForm(!showVehicleForm)}><Plus size={15} /> Tambah</button></div>
              {showVehicleForm && (
                <form className="vehicle-form" onSubmit={addVehicle}>
                  <label className="field"><span>Merek</span><input required value={vehicleForm.brand} onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })} placeholder="Honda" /></label>
                  <label className="field"><span>Model</span><input required value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} placeholder="Vario 160" /></label>
                  <label className="field"><span>Nomor polisi</span><input required value={vehicleForm.plateNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })} placeholder="BN 1234 TK" /></label>
                  <button className="button button-yellow button-small">Simpan kendaraan</button>
                </form>
              )}
              {vehicles.length ? vehicles.map((vehicle) => (
                <div className="vehicle-row" key={vehicle.vehicle_id}><span className="vehicle-icon"><Bike size={20} /></span><div><strong>{vehicle.brand} {vehicle.model}</strong><small>{vehicle.plate_number} · {vehicle.vehicle_type}</small></div><Check size={16} className="vehicle-check" /></div>
              )) : <EmptyState icon={Bike} title="Garasi masih kosong" description="Tambahkan kendaraan agar mudah dipilih saat meminta bantuan." />}
            </article>
            <article className="panel help-panel"><div className="help-mark"><CircleHelp size={22} /></div><span className="section-index">BUTUH BANTUAN?</span><h2>Lokasi akurat.<br /><em>Lebih cepat dibantu.</em></h2><p>Izinkan akses lokasi atau ketuk peta untuk menandai titik kendaraan. Montir terdekat akan menerima permintaan Anda.</p><button className="button button-dark" onClick={() => setActiveView('dashboard')}>Panggil montir <ArrowRight size={16} /></button></article>
          </section>
        )}

        {activeView === 'operations' && !isOwner && (
          <section className="operations-admin">
            {workshopForm && !isSuper && (
              <article className="panel profile-panel">
                <div className="panel-heading"><div><span className="section-index">PROFIL LOKASI</span><h2>Informasi <em>bengkel.</em></h2></div><span className="small-count">BENGKEL #{workshopForm.workshopId}</span></div>
                <form className="profile-form" onSubmit={saveWorkshop}>
                  <label className="field"><span>Nama bengkel</span><input required value={workshopForm.workshopName} onChange={(e) => setWorkshopForm({ ...workshopForm, workshopName: e.target.value })} /></label>
                  <label className="field"><span>Telepon</span><input required value={workshopForm.phone} onChange={(e) => setWorkshopForm({ ...workshopForm, phone: e.target.value })} /></label>
                  <label className="field field-wide"><span>Alamat</span><input required value={workshopForm.address} onChange={(e) => setWorkshopForm({ ...workshopForm, address: e.target.value })} /></label>
                  <label className="field"><span>Latitude</span><input required type="number" step="any" value={workshopForm.lat} onChange={(e) => setWorkshopForm({ ...workshopForm, lat: Number(e.target.value) })} /></label>
                  <label className="field"><span>Longitude</span><input required type="number" step="any" value={workshopForm.lng} onChange={(e) => setWorkshopForm({ ...workshopForm, lng: Number(e.target.value) })} /></label>
                  <div className="field-action"><button className="button button-yellow button-small">Simpan profil</button></div>
                </form>
              </article>
            )}
            <article className="panel mechanics-panel">
              <div className="panel-heading"><div><span className="section-index">TIM LAYANAN</span><h2>Montir <em>siaga.</em></h2></div><div className="panel-heading-actions"><span className="small-count">{mechanics.length} MONTIR</span><button className="button button-dark button-small" onClick={() => setShowMechanicForm(!showMechanicForm)}><Plus size={14} /> Tambah</button></div></div>
              {showMechanicForm && <form className="mechanic-form" onSubmit={addMechanic}>
                <label className="field"><span>Nama montir</span><input required value={mechanicForm.fullName} onChange={(e) => setMechanicForm({ ...mechanicForm, fullName: e.target.value })} /></label>
                <label className="field"><span>Telepon</span><input required value={mechanicForm.phone} onChange={(e) => setMechanicForm({ ...mechanicForm, phone: e.target.value })} /></label>
                {isSuper && <label className="field"><span>Bengkel</span><select required value={mechanicForm.workshopId} onChange={(e) => setMechanicForm({ ...mechanicForm, workshopId: e.target.value })}><option value="">Pilih bengkel</option>{workshops.map((workshop) => <option key={workshop.workshop_id} value={workshop.workshop_id}>{workshop.workshop_name}</option>)}</select></label>}
                <button className="button button-yellow button-small">Simpan montir</button>
              </form>}
              {mechanics.map((mechanic) => (
                <div className="mechanic-row" key={mechanic.mechanic_id}>
                  <span className={`mechanic-avatar mechanic-${mechanic.status_active?.toLowerCase()}`}><Wrench size={17} /></span>
                  <div className="mechanic-name"><strong>{mechanic.full_name}</strong><small>{mechanic.workshop_name} · {mechanic.phone_number}</small></div>
                  {isSuper && <span className="mechanic-workshop">{mechanic.workshop_name}</span>}
                  <select value={mechanic.status_active} onChange={(e) => updateMechanic(mechanic.mechanic_id, e.target.value)} aria-label={`Status ${mechanic.full_name}`}>
                    <option value="SIAGA">Siaga</option><option value="SIBUK">Sibuk</option><option value="OFFLINE">Offline</option>
                  </select>
                </div>
              ))}
              {mechanics.length === 0 && <EmptyState icon={Users} title="Belum ada montir" description="Data montir belum dimasukkan ke sistem." />}
            </article>
            {!isSuper && <article className="panel services-panel">
              <div className="panel-heading"><div><span className="section-index">KATALOG BENGKEL</span><h2>Layanan <em>tersedia.</em></h2></div><button className="button button-dark button-small" onClick={() => setShowServiceForm(!showServiceForm)}><Plus size={14} /> Tambah</button></div>
              {showServiceForm && <form className="service-form admin-service-form" onSubmit={addWorkshopService}>
                <label className="field"><span>Nama layanan</span><input required value={serviceForm.serviceName} onChange={(e) => setServiceForm({ ...serviceForm, serviceName: e.target.value })} /></label>
                <label className="field"><span>Deskripsi</span><input value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} /></label>
                <label className="field"><span>Harga dasar (Rp)</span><input type="number" min="0" required value={serviceForm.basePrice} onChange={(e) => setServiceForm({ ...serviceForm, basePrice: e.target.value })} /></label>
                <button className="button button-yellow button-small">Simpan layanan</button>
              </form>}
              {(catalog?.services || []).filter((service) => Number(service.workshop_id) === Number(account.workshop_id)).map((service) => <div className="service-list-row" key={service.service_id}><span><Wrench size={15} /></span><div><strong>{service.service_name}</strong><small>{service.description || 'Layanan bengkel'}</small></div><b>{money(service.base_price)}</b></div>)}
              {!(catalog?.services || []).some((service) => Number(service.workshop_id) === Number(account.workshop_id)) && <EmptyState icon={Wrench} title="Belum ada layanan" description="Tambahkan layanan yang tersedia di bengkel Anda." />}
            </article>}
            {isSuper && <SuperAdminTools workshops={workshops} zones={zones} zoneDrafts={zoneDrafts} setZoneDrafts={setZoneDrafts} onSaveZone={saveZone} onRefresh={loadData} onError={setGlobalError} />}
          </section>
        )}

        <footer className="app-footer"><Brand /><span>Lokasi presisi. Bantuan tanpa menunggu lama.</span><span>© 2026 Titik Kunci</span></footer>
      </main>
    </div>
  );
}

function SuperAdminTools({ workshops, zones, zoneDrafts, setZoneDrafts, onSaveZone, onRefresh, onError }) {
  const [showWorkshopForm, setShowWorkshopForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [workshop, setWorkshop] = useState({ workshopName: '', phone: '', address: '', lat: CITY_CENTER[0], lng: CITY_CENTER[1] });
  const [account, setAccount] = useState({ fullName: '', phone: '', password: '', role: 'ADMIN_BENGKEL', workshopId: '' });
  const [service, setService] = useState({ workshopId: '', serviceName: '', description: '', basePrice: '' });

  async function createWorkshop(event) {
    event.preventDefault();
    try {
      await apiRequest('/admin/workshops', { method: 'POST', body: JSON.stringify(workshop) });
      setWorkshop({ workshopName: '', phone: '', address: '', lat: CITY_CENTER[0], lng: CITY_CENTER[1] });
      setShowWorkshopForm(false);
      await onRefresh();
    } catch (error) { onError(error.message); }
  }

  async function createAccount(event) {
    event.preventDefault();
    try {
      await apiRequest('/admin/accounts', { method: 'POST', body: JSON.stringify(account) });
      setAccount({ fullName: '', phone: '', password: '', role: 'ADMIN_BENGKEL', workshopId: '' });
      setShowAccountForm(false);
    } catch (error) { onError(error.message); }
  }

  async function createService(event) {
    event.preventDefault();
    try {
      await apiRequest('/admin/services', { method: 'POST', body: JSON.stringify(service) });
      setService({ workshopId: '', serviceName: '', description: '', basePrice: '' });
      await onRefresh();
    } catch (error) { onError(error.message); }
  }

  return (
    <>
      <article className="panel system-panel">
        <div className="panel-heading"><div><span className="section-index">ADMINISTRASI</span><h2>Kelola <em>akses & lokasi.</em></h2></div></div>
        <div className="admin-tool-actions">
          <button className="button button-dark button-small" onClick={() => setShowWorkshopForm(!showWorkshopForm)}><Plus size={15} /> Tambah bengkel</button>
          <button className="button button-outline button-small" onClick={() => setShowAccountForm(!showAccountForm)}><Plus size={15} /> Akun admin</button>
        </div>
        {showWorkshopForm && <form className="profile-form compact-form" onSubmit={createWorkshop}>
          <label className="field"><span>Nama bengkel</span><input required value={workshop.workshopName} onChange={(e) => setWorkshop({ ...workshop, workshopName: e.target.value })} /></label>
          <label className="field"><span>Telepon</span><input required value={workshop.phone} onChange={(e) => setWorkshop({ ...workshop, phone: e.target.value })} /></label>
          <label className="field field-wide"><span>Alamat</span><input required value={workshop.address} onChange={(e) => setWorkshop({ ...workshop, address: e.target.value })} /></label>
          <label className="field"><span>Latitude</span><input required type="number" step="any" value={workshop.lat} onChange={(e) => setWorkshop({ ...workshop, lat: Number(e.target.value) })} /></label>
          <label className="field"><span>Longitude</span><input required type="number" step="any" value={workshop.lng} onChange={(e) => setWorkshop({ ...workshop, lng: Number(e.target.value) })} /></label>
          <button className="button button-yellow button-small">Simpan bengkel</button>
        </form>}
        {showAccountForm && <form className="profile-form compact-form" onSubmit={createAccount}>
          <label className="field"><span>Nama</span><input required value={account.fullName} onChange={(e) => setAccount({ ...account, fullName: e.target.value })} /></label>
          <label className="field"><span>Telepon</span><input required value={account.phone} onChange={(e) => setAccount({ ...account, phone: e.target.value })} /></label>
          <label className="field"><span>Kata sandi sementara</span><input required minLength="10" type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></label>
          <label className="field"><span>Peran</span><select value={account.role} onChange={(e) => setAccount({ ...account, role: e.target.value })}><option value="ADMIN_BENGKEL">Admin bengkel</option><option value="SUPER_ADMIN">Super admin</option></select></label>
          {account.role === 'ADMIN_BENGKEL' && <label className="field"><span>Bengkel</span><select required value={account.workshopId} onChange={(e) => setAccount({ ...account, workshopId: e.target.value })}><option value="">Pilih bengkel</option>{workshops.map((item) => <option key={item.workshop_id} value={item.workshop_id}>{item.workshop_name}</option>)}</select></label>}
          <button className="button button-yellow button-small">Buat akun admin</button>
        </form>}
        <div className="workshop-list">
          {workshops.map((item) => <div className="workshop-admin-row" key={item.workshop_id}><span className="nearby-icon workshop-icon"><Store size={16} /></span><div><strong>{item.workshop_name}</strong><small>{item.address}</small></div><StatusBadge status={item.approval_status === 'AKTIF' ? 'SIAGA' : 'OFFLINE'} /></div>)}
        </div>
      </article>
      <article className="panel zones-panel">
        <div className="panel-heading"><div><span className="section-index">TARIF BERDASARKAN LOKASI</span><h2>Zona <em>layanan.</em></h2></div><Gauge size={20} className="panel-heading-icon" /></div>
        <p className="panel-intro">Tarif dihitung dari biaya dasar zona dan jarak rute OSRM.</p>
        {zones.map((zone) => (
          <div className="zone-row" key={zone.zone_id}>
            <div className="zone-name"><strong>{zone.zone_name}</strong><small>Biaya dasar + tarif per kilometer</small></div>
            <label><span>Dasar</span><input type="number" min="0" value={zoneDrafts[zone.zone_id]?.baseRate ?? zone.base_rate} onChange={(e) => setZoneDrafts({ ...zoneDrafts, [zone.zone_id]: { ...zoneDrafts[zone.zone_id], baseRate: e.target.value } })} /></label>
            <label><span>/ km</span><input type="number" min="0" value={zoneDrafts[zone.zone_id]?.ratePerKm ?? zone.rate_per_km} onChange={(e) => setZoneDrafts({ ...zoneDrafts, [zone.zone_id]: { ...zoneDrafts[zone.zone_id], ratePerKm: e.target.value } })} /></label>
            <button className="button button-quiet button-small" onClick={() => onSaveZone(zone.zone_id)}>Simpan</button>
          </div>
        ))}
        {workshops.length > 0 && <form className="service-form" onSubmit={createService}>
          <span className="section-index">TAMBAH LAYANAN BENGKEL</span>
          <div className="service-form-row">
            <select required value={service.workshopId} onChange={(e) => setService({ ...service, workshopId: e.target.value })}><option value="">Pilih bengkel</option>{workshops.map((item) => <option key={item.workshop_id} value={item.workshop_id}>{item.workshop_name}</option>)}</select>
            <input required placeholder="Nama layanan" value={service.serviceName} onChange={(e) => setService({ ...service, serviceName: e.target.value })} />
            <input type="number" min="0" required placeholder="Harga dasar (Rp)" value={service.basePrice} onChange={(e) => setService({ ...service, basePrice: e.target.value })} />
            <button className="button button-dark button-small">Tambah layanan</button>
          </div>
        </form>}
      </article>
    </>
  );
}

export default App;
