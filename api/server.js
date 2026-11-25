import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mysql from 'mysql2/promise';

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment values: ${missing.join(', ')}`);
}

const app = express();
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});
const jwtSecret = process.env.JWT_SECRET;
const osrmUrl = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireValue(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${label} wajib diisi.`);
  }
  return value.trim();
}

function parseCoordinates(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new HttpError(400, 'Koordinat lokasi tidak valid.');
  }
  return { lat: latitude, lng: longitude };
}

function pointWkt({ lat, lng }) {
  return `POINT(${lat} ${lng})`;
}

function pointFromWkt(wkt) {
  const match = /^POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt || '');
  if (!match) return null;
  return { lng: Number(match[1]), lat: Number(match[2]) };
}

function lineFromWkt(wkt) {
  const match = /^LINESTRING\((.+)\)$/i.exec(wkt || '');
  if (!match) return [];
  return match[1].split(',').map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return { lat, lng };
  });
}

function distanceKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const latDelta = radians(b.lat - a.lat);
  const lngDelta = radians(b.lng - a.lng);
  const haversine = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) *
    Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createToken(account) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encodeBase64Url(JSON.stringify({
    sub: account.account_id,
    role: account.role,
    workshopId: account.workshop_id,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  }));
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function readToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
  const [header, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
  }
  if (!Number.isInteger(claims.sub) || claims.exp <= Date.now() / 1000) {
    throw new HttpError(401, 'Sesi kedaluwarsa. Silakan masuk kembali.');
  }
  return claims;
}

function authenticate(req, _res, next) {
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return next(new HttpError(401, 'Silakan masuk untuk melanjutkan.'));
  try {
    req.auth = readToken(authorization.slice(7));
    next();
  } catch (error) {
    next(error);
  }
}

function allowRoles(...roles) {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(new HttpError(403, 'Akun ini tidak memiliki akses ke fitur tersebut.'));
    }
    next();
  };
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new HttpError(400, 'Kata sandi harus terdiri dari 10 sampai 128 karakter.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, salt, expectedHex] = (encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (error, key) => error ? reject(error) : resolve(key));
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function requireAdminWorkshop(req, workshopId) {
  if (req.auth.role === 'SUPER_ADMIN') return;
  if (req.auth.role !== 'ADMIN_BENGKEL' || Number(req.auth.workshopId) !== Number(workshopId)) {
    throw new HttpError(403, 'Anda hanya dapat mengelola bengkel yang terhubung ke akun Anda.');
  }
}

async function getAccount(accountId) {
  const [rows] = await pool.execute(
    `SELECT a.account_id, a.full_name, a.phone_number, a.role, a.workshop_id,
            b.workshop_name
     FROM akun a
     LEFT JOIN bengkel b ON b.workshop_id = a.workshop_id
     WHERE a.account_id = ?`,
    [accountId],
  );
  if (!rows.length) throw new HttpError(401, 'Akun tidak ditemukan.');
  return rows[0];
}

async function buildQuote(location) {
  const [zoneRows] = await pool.execute(
    `SELECT zone_id, base_rate, rate_per_km FROM zona_geofence
     WHERE ST_Contains(boundary, ST_GeomFromText(?, 4326)) LIMIT 1`,
    [pointWkt(location)],
  );
  if (!zoneRows.length) {
    throw new HttpError(422, 'Lokasi berada di luar zona layanan. Silakan pilih lokasi dalam area Pangkalpinang–Balunijuk.');
  }

  const [mechanics] = await pool.execute(
    `SELECT m.mechanic_id, m.workshop_id, m.full_name,
            ST_AsText(m.current_location, 'axis-order=long-lat') AS location_wkt
     FROM mekanik m JOIN bengkel b ON b.workshop_id = m.workshop_id
     WHERE m.status_active = 'SIAGA' AND b.approval_status = 'AKTIF'`,
  );
  const candidates = mechanics.map((mechanic) => ({
    ...mechanic,
    location: pointFromWkt(mechanic.location_wkt),
  })).filter((mechanic) => mechanic.location);
  candidates.sort((a, b) => distanceKm(location, a.location) - distanceKm(location, b.location));
  const nearest = candidates[0] || null;
  const [workshopRows] = await pool.execute(
    `SELECT workshop_id, workshop_name,
            ST_AsText(location, 'axis-order=long-lat') AS location_wkt
     FROM bengkel WHERE approval_status = 'AKTIF'`,
  );
  const nearbyWorkshops = workshopRows.map((workshop) => ({
    ...workshop,
    location: pointFromWkt(workshop.location_wkt),
  })).filter((workshop) => workshop.location);
  nearbyWorkshops.sort((a, b) => distanceKm(location, a.location) - distanceKm(location, b.location));
  const targetWorkshop = nearest
    ? nearbyWorkshops.find((workshop) => Number(workshop.workshop_id) === Number(nearest.workshop_id))
    : nearbyWorkshops[0] || null;

  let route = [];
  let routeSource = 'BELUM_TERSEDIA';
  let distance = 0;
  if (nearest) {
    const routeUrl = `${osrmUrl}/route/v1/driving/${nearest.location.lng},${nearest.location.lat};${location.lng},${location.lat}?overview=full&geometries=geojson`;
    let response;
    try {
      response = await fetch(routeUrl, { signal: AbortSignal.timeout(8000) });
    } catch (error) {
      throw new HttpError(503, `Layanan rute tidak dapat dihubungi (${error.name}). Coba lagi beberapa saat.`);
    }
    if (!response.ok) throw new HttpError(502, 'Layanan rute sedang bermasalah. Pesanan belum dibuat; coba lagi.');
    const routeResult = await response.json();
    const bestRoute = routeResult.code === 'Ok' && routeResult.routes?.[0];
    if (!bestRoute) throw new HttpError(422, 'Rute jalan ke lokasi ini tidak ditemukan. Periksa kembali titik lokasi.');
    route = bestRoute.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    distance = bestRoute.distance / 1000;
    routeSource = 'OSRM';
  }

  const zone = zoneRows[0];
  const totalCost = Number(zone.base_rate) + Number(zone.rate_per_km) * distance;
  const routeWkt = route.length > 1
    ? `LINESTRING(${route.map(({ lat, lng }) => `${lat} ${lng}`).join(',')})`
    : null;
  return {
    zoneId: zone.zone_id,
    mechanic: nearest ? {
      mechanic_id: nearest.mechanic_id,
      workshop_id: nearest.workshop_id,
      full_name: nearest.full_name,
      location: nearest.location,
    } : null,
    workshopId: targetWorkshop?.workshop_id || null,
    workshopName: targetWorkshop?.workshop_name || null,
    route,
    routeWkt,
    distance,
    routeSource,
    totalCost,
  };
}

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
});

app.post('/api/auth/register', async (req, res) => {
  const fullName = requireValue(req.body.fullName, 'Nama');
  const phone = requireValue(req.body.phone, 'Nomor telepon');
  const [pendingApplications] = await pool.execute(
    `SELECT 1 FROM pengajuan_bengkel
     WHERE phone_number = ? AND application_status = 'MENUNGGU' LIMIT 1`,
    [phone],
  );
  if (pendingApplications.length) {
    throw new HttpError(409, 'Nomor telepon sedang digunakan pada pengajuan bengkel yang menunggu verifikasi.');
  }
  const password = req.body.password;
  const passwordHash = await hashPassword(password);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [accountResult] = await connection.execute(
      'INSERT INTO akun (full_name, phone_number, password_hash, role) VALUES (?, ?, ?, ?)',
      [fullName, phone, passwordHash, 'PEMILIK'],
    );
    const [customerResult] = await connection.execute(
      'INSERT INTO pelanggan (account_id, full_name, phone_number) VALUES (?, ?, ?)',
      [accountResult.insertId, fullName, phone],
    );
    await connection.commit();
    const account = await getAccount(accountResult.insertId);
    res.status(201).json({
      token: createToken(account),
      account: { ...account, user_id: customerResult.insertId },
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.post('/api/workshop-applications', async (req, res) => {
  const fullName = requireValue(req.body.fullName, 'Nama penanggung jawab');
  const phone = requireValue(req.body.phone, 'Nomor telepon');
  const workshopName = requireValue(req.body.workshopName, 'Nama bengkel');
  const address = requireValue(req.body.address, 'Alamat bengkel');
  if (fullName.length > 100 || phone.length > 20 || workshopName.length > 120 || address.length > 1000) {
    throw new HttpError(400, 'Periksa panjang nama, nomor telepon, atau alamat bengkel.');
  }
  const subscriptionPlan = req.body.subscriptionPlan;
  if (!['PRO', 'ULTRA', 'ENTERPRISE'].includes(subscriptionPlan)) {
    throw new HttpError(400, 'Pilih paket langganan yang tersedia.');
  }
  const [existing] = await pool.execute(
    `SELECT 1 FROM akun WHERE phone_number = ?
     UNION ALL SELECT 1 FROM bengkel WHERE phone_number = ?
     UNION ALL SELECT 1 FROM pengajuan_bengkel
       WHERE phone_number = ? AND application_status = 'MENUNGGU'
     LIMIT 1`,
    [phone, phone, phone],
  );
  if (existing.length) {
    throw new HttpError(409, 'Nomor telepon sudah terdaftar atau memiliki pengajuan yang sedang ditinjau.');
  }
  const passwordHash = await hashPassword(req.body.password);
  const [result] = await pool.execute(
    `INSERT INTO pengajuan_bengkel
      (full_name, phone_number, password_hash, workshop_name, address, subscription_plan)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fullName, phone, passwordHash, workshopName, address, subscriptionPlan],
  );
  res.status(201).json({
    application_id: result.insertId,
    application_status: 'MENUNGGU',
  });
});

app.post('/api/auth/login', async (req, res) => {
  const phone = requireValue(req.body.phone, 'Nomor telepon');
  const password = req.body.password;
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    throw new HttpError(400, 'Kata sandi wajib diisi.');
  }
  const [rows] = await pool.execute('SELECT * FROM akun WHERE phone_number = ? LIMIT 1', [phone]);
  if (!rows.length || !await verifyPassword(password, rows[0].password_hash)) {
    throw new HttpError(401, 'Nomor telepon atau kata sandi tidak cocok.');
  }
  const account = await getAccount(rows[0].account_id);
  res.json({ token: createToken(account), account });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  res.json({ account: await getAccount(req.auth.sub) });
});

app.get('/api/catalog', async (_req, res) => {
  const [[workshops], [mechanics], [stores], [services]] = await Promise.all([
    pool.execute(
      `SELECT workshop_id, workshop_name, phone_number, address, approval_status,
              ST_AsText(location, 'axis-order=long-lat') AS location_wkt
       FROM bengkel WHERE approval_status = 'AKTIF' ORDER BY workshop_name`,
    ),
    pool.execute(
      `SELECT m.mechanic_id, m.workshop_id, m.full_name, m.status_active,
              ST_AsText(m.current_location, 'axis-order=long-lat') AS location_wkt
       FROM mekanik m JOIN bengkel b ON b.workshop_id = m.workshop_id
       WHERE b.approval_status = 'AKTIF' ORDER BY m.full_name`,
    ),
    pool.execute(
      `SELECT store_id, store_name, address,
              ST_AsText(location, 'axis-order=long-lat') AS location_wkt
       FROM toko_sparepart ORDER BY store_name`,
    ),
    pool.execute(
      `SELECT service_id, workshop_id, service_name, description, base_price
       FROM layanan_bengkel WHERE is_active = 1 ORDER BY service_name`,
    ),
  ]);
  const withLocation = (row) => {
    const { location_wkt, ...rest } = row;
    return { ...rest, location: pointFromWkt(location_wkt) };
  };
  res.json({
    workshops: workshops.map(withLocation),
    mechanics: mechanics.map(withLocation),
    stores: stores.map(withLocation),
    services,
  });
});

app.get('/api/quote', authenticate, allowRoles('PEMILIK'), async (req, res) => {
  const location = parseCoordinates(req.query.lat, req.query.lng);
  const quote = await buildQuote(location);
  res.json({
    mechanic: quote.mechanic,
    workshop_name: quote.workshopName,
    route: quote.route,
    distance_km: Number(quote.distance.toFixed(2)),
    route_source: quote.routeSource,
    total_cost: Number(quote.totalCost.toFixed(2)),
    incidentLocation: location,
  });
});

app.get('/api/vehicles', authenticate, allowRoles('PEMILIK'), async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT v.vehicle_id, v.brand, v.model, v.plate_number, v.vehicle_type
     FROM kendaraan v JOIN pelanggan p ON p.user_id = v.user_id
     WHERE p.account_id = ? ORDER BY v.created_at DESC`,
    [req.auth.sub],
  );
  res.json({ vehicles: rows });
});

app.post('/api/vehicles', authenticate, allowRoles('PEMILIK'), async (req, res) => {
  const brand = requireValue(req.body.brand, 'Merek kendaraan');
  const model = requireValue(req.body.model, 'Model kendaraan');
  const plate = requireValue(req.body.plateNumber, 'Nomor polisi').toUpperCase();
  const type = req.body.vehicleType === 'MOBIL' ? 'MOBIL' : 'MOTOR';
  const [[customer]] = await pool.execute('SELECT user_id FROM pelanggan WHERE account_id = ?', [req.auth.sub]);
  if (!customer) throw new HttpError(404, 'Profil pemilik kendaraan tidak ditemukan.');
  const [result] = await pool.execute(
    'INSERT INTO kendaraan (user_id, brand, model, plate_number, vehicle_type) VALUES (?, ?, ?, ?, ?)',
    [customer.user_id, brand, model, plate, type],
  );
  res.status(201).json({
    vehicle: { vehicle_id: result.insertId, brand, model, plate_number: plate, vehicle_type: type },
  });
});

app.get('/api/orders', authenticate, async (req, res) => {
  let filter = '';
  const params = [];
  if (req.auth.role === 'PEMILIK') {
    filter = 'WHERE p.account_id = ?';
    params.push(req.auth.sub);
  } else if (req.auth.role === 'ADMIN_BENGKEL') {
    filter = 'WHERE o.workshop_id = ?';
    params.push(req.auth.workshopId);
  }
  const [rows] = await pool.execute(
    `SELECT o.order_id, o.user_id, o.vehicle_id, o.mechanic_id, o.workshop_id,
            o.issue_description, o.distance_km, o.route_source, o.total_cost,
            o.payment_method, o.payment_status, o.order_status,
            o.cancellation_reason, o.created_at, o.accepted_at, o.completed_at,
            ST_AsText(o.incident_location, 'axis-order=long-lat') AS incident_wkt,
            ST_AsText(o.route_line, 'axis-order=long-lat') AS route_wkt,
            p.full_name AS customer_name, p.phone_number AS customer_phone,
            m.full_name AS mechanic_name, b.workshop_name, v.brand, v.model, v.plate_number
     FROM pesanan_darurat o
     JOIN pelanggan p ON p.user_id = o.user_id
     LEFT JOIN mekanik m ON m.mechanic_id = o.mechanic_id
     LEFT JOIN bengkel b ON b.workshop_id = o.workshop_id
     LEFT JOIN kendaraan v ON v.vehicle_id = o.vehicle_id
     ${filter}
     ORDER BY o.created_at DESC, o.order_id DESC`,
    params,
  );
  res.json({
    orders: rows.map((row) => {
      const { incident_wkt, route_wkt, ...order } = row;
      return {
        ...order,
        incidentLocation: pointFromWkt(incident_wkt),
        route: lineFromWkt(route_wkt),
      };
    }),
  });
});

app.post('/api/orders', authenticate, allowRoles('PEMILIK'), async (req, res) => {
  const issue = requireValue(req.body.issueDescription, 'Deskripsi kendala');
  if (issue.length > 500) throw new HttpError(400, 'Deskripsi maksimal 500 karakter.');
  const location = parseCoordinates(req.body.lat, req.body.lng);
  const [[customer]] = await pool.execute('SELECT user_id FROM pelanggan WHERE account_id = ?', [req.auth.sub]);
  if (!customer) throw new HttpError(404, 'Profil pemilik kendaraan tidak ditemukan.');

  let vehicleId = null;
  if (req.body.vehicleId) {
    const [[vehicle]] = await pool.execute(
      `SELECT v.vehicle_id FROM kendaraan v
       JOIN pelanggan p ON p.user_id = v.user_id
       WHERE v.vehicle_id = ? AND p.account_id = ?`,
      [req.body.vehicleId, req.auth.sub],
    );
    if (!vehicle) throw new HttpError(400, 'Kendaraan yang dipilih tidak terdaftar pada akun ini.');
    vehicleId = vehicle.vehicle_id;
  }

  const quote = await buildQuote(location);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO pesanan_darurat
       (user_id, vehicle_id, mechanic_id, workshop_id, issue_description,
        incident_location, route_line, distance_km, route_source, total_cost)
       VALUES (?, ?, ?, ?, ?, ST_GeomFromText(?, 4326),
               ${quote.routeWkt ? 'ST_GeomFromText(?, 4326)' : 'NULL'}, ?, ?, ?)`,
      quote.routeWkt
        ? [customer.user_id, vehicleId, quote.mechanic?.mechanic_id || null, quote.workshopId,
          issue, pointWkt(location), quote.routeWkt, quote.distance, quote.routeSource, quote.totalCost]
        : [customer.user_id, vehicleId, null, quote.workshopId, issue, pointWkt(location), quote.distance, quote.routeSource, quote.totalCost],
    );
    await connection.execute(
      `INSERT INTO riwayat_pesanan (order_id, account_id, order_status, note)
       VALUES (?, ?, 'PENDING', ?)`,
      [result.insertId, req.auth.sub, quote.mechanic ? 'Permintaan bantuan dikirim ke montir terdekat.' : 'Permintaan dibuat; belum ada montir siaga.'],
    );
    await connection.commit();
    res.status(201).json({
      order: {
        order_id: result.insertId,
        order_status: 'PENDING',
        mechanic_id: quote.mechanic?.mechanic_id || null,
        mechanic_name: quote.mechanic?.full_name || null,
        distance_km: Number(quote.distance.toFixed(2)),
        route_source: quote.routeSource,
        total_cost: Number(quote.totalCost.toFixed(2)),
        incidentLocation: location,
        route: quote.route,
      },
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.patch('/api/orders/:id/status', authenticate, async (req, res) => {
  const orderId = Number(req.params.id);
  const nextStatus = req.body.status;
  const allowedStatuses = ['DITERIMA', 'DALAM_PERJALANAN', 'SEDANG_DIKERJAKAN', 'SELESAI', 'DIBATALKAN'];
  if (!Number.isInteger(orderId) || !allowedStatuses.includes(nextStatus)) {
    throw new HttpError(400, 'ID pesanan atau status tidak valid.');
  }
  const [[order]] = await pool.execute(
    'SELECT * FROM pesanan_darurat WHERE order_id = ?',
    [orderId],
  );
  if (!order) throw new HttpError(404, 'Pesanan tidak ditemukan.');

  if (req.auth.role === 'PEMILIK') {
    const [[customer]] = await pool.execute(
      'SELECT user_id FROM pelanggan WHERE account_id = ?',
      [req.auth.sub],
    );
    if (Number(order.user_id) !== Number(customer?.user_id) ||
        nextStatus !== 'DIBATALKAN' || !['PENDING', 'DITERIMA'].includes(order.order_status)) {
      throw new HttpError(403, 'Pesanan ini tidak dapat dibatalkan dari akun Anda.');
    }
  } else if (req.auth.role === 'ADMIN_BENGKEL') {
    requireAdminWorkshop(req, order.workshop_id);
    const transitions = {
      PENDING: ['DITERIMA', 'DIBATALKAN'],
      DITERIMA: ['DALAM_PERJALANAN', 'DIBATALKAN'],
      DALAM_PERJALANAN: ['SEDANG_DIKERJAKAN', 'DIBATALKAN'],
      SEDANG_DIKERJAKAN: ['SELESAI'],
    };
    if (!(transitions[order.order_status] || []).includes(nextStatus)) {
      throw new HttpError(409, `Status tidak dapat diubah dari ${order.order_status} ke ${nextStatus}.`);
    }
  } else if (req.auth.role !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'Akun tidak dapat memperbarui status pesanan.');
  }

  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 255) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE pesanan_darurat
       SET order_status = ?,
           accepted_at = IF(? = 'DITERIMA' AND accepted_at IS NULL, CURRENT_TIMESTAMP, accepted_at),
           completed_at = IF(? = 'SELESAI', CURRENT_TIMESTAMP, completed_at),
           cancellation_reason = IF(? = 'DIBATALKAN', ?, NULL)
       WHERE order_id = ?`,
      [nextStatus, nextStatus, nextStatus, nextStatus, note, orderId],
    );
    await connection.execute(
      `INSERT INTO riwayat_pesanan (order_id, account_id, order_status, note)
       VALUES (?, ?, ?, ?)`,
      [orderId, req.auth.sub, nextStatus, note],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ order_id: orderId, order_status: nextStatus });
});

app.patch('/api/orders/:id/payment', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const orderId = Number(req.params.id);
  const [[order]] = await pool.execute('SELECT * FROM pesanan_darurat WHERE order_id = ?', [orderId]);
  if (!order) throw new HttpError(404, 'Pesanan tidak ditemukan.');
  requireAdminWorkshop(req, order.workshop_id);
  if (order.order_status !== 'SELESAI') {
    throw new HttpError(409, 'Pembayaran hanya dapat dicatat setelah layanan selesai.');
  }
  await pool.execute(
    `UPDATE pesanan_darurat SET payment_status = 'TERCATAT' WHERE order_id = ?`,
    [orderId],
  );
  await pool.execute(
    `INSERT INTO riwayat_pesanan (order_id, account_id, order_status, note)
     VALUES (?, ?, ?, 'Pembayaran tunai telah diterima.')`,
    [orderId, req.auth.sub, order.order_status],
  );
  res.json({ order_id: orderId, payment_status: 'TERCATAT' });
});

app.patch('/api/orders/:id/assign', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const orderId = Number(req.params.id);
  const mechanicId = Number(req.body.mechanicId);
  if (!Number.isInteger(orderId) || !Number.isInteger(mechanicId)) {
    throw new HttpError(400, 'Pesanan atau montir yang dipilih tidak valid.');
  }
  const [[order]] = await pool.execute('SELECT * FROM pesanan_darurat WHERE order_id = ?', [orderId]);
  if (!order) throw new HttpError(404, 'Pesanan tidak ditemukan.');
  requireAdminWorkshop(req, order.workshop_id);
  if (!['PENDING', 'DITERIMA'].includes(order.order_status)) {
    throw new HttpError(409, 'Montir hanya dapat ditetapkan pada pesanan yang menunggu atau diterima.');
  }
  const [[mechanic]] = await pool.execute(
    `SELECT mechanic_id, workshop_id FROM mekanik
     WHERE mechanic_id = ? AND workshop_id = ? AND status_active = 'SIAGA'`,
    [mechanicId, order.workshop_id],
  );
  if (!mechanic) throw new HttpError(400, 'Montir siaga dari bengkel pesanan tidak ditemukan.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE pesanan_darurat SET mechanic_id = ? WHERE order_id = ?', [mechanicId, orderId]);
    await connection.execute(
      `INSERT INTO riwayat_pesanan (order_id, account_id, order_status, note)
       VALUES (?, ?, ?, 'Montir siaga ditugaskan ke pesanan.')`,
      [orderId, req.auth.sub, order.order_status],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ order_id: orderId, mechanic_id: mechanicId });
});

app.get('/api/admin/summary', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const isSuperAdmin = req.auth.role === 'SUPER_ADMIN';
  const condition = isSuperAdmin ? '' : 'WHERE workshop_id = ?';
  const params = isSuperAdmin ? [] : [req.auth.workshopId];
  const [[workshopCount]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM bengkel ${isSuperAdmin ? '' : 'WHERE workshop_id = ?'}`,
    params,
  );
  const [[mechanicCount]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM mekanik ${condition}`,
    params,
  );
  const [[orderCount]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM pesanan_darurat ${isSuperAdmin ? '' : 'WHERE workshop_id = ?'}`,
    params,
  );
  const [[activeCount]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM pesanan_darurat
     ${isSuperAdmin ? "WHERE order_status NOT IN ('SELESAI','DIBATALKAN')" : "WHERE workshop_id = ? AND order_status NOT IN ('SELESAI','DIBATALKAN')"}`,
    params,
  );
  res.json({
    workshops: workshopCount.count,
    mechanics: mechanicCount.count,
    orders: orderCount.count,
    activeOrders: activeCount.count,
  });
});

app.get('/api/admin/workshops', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const where = req.auth.role === 'SUPER_ADMIN' ? '' : 'WHERE workshop_id = ?';
  const params = req.auth.role === 'SUPER_ADMIN' ? [] : [req.auth.workshopId];
  const [rows] = await pool.execute(
    `SELECT workshop_id, workshop_name, phone_number, address, approval_status,
            ST_AsText(location, 'axis-order=long-lat') AS location_wkt
     FROM bengkel ${where} ORDER BY workshop_name`,
    params,
  );
  res.json({ workshops: rows.map((row) => {
    const { location_wkt, ...workshop } = row;
    return { ...workshop, location: pointFromWkt(location_wkt) };
  }) });
});

app.get('/api/admin/workshop-applications', authenticate, allowRoles('SUPER_ADMIN'), async (_req, res) => {
  const [applications] = await pool.execute(
    `SELECT application_id, full_name, phone_number, workshop_name, address,
            subscription_plan, application_status, created_at
     FROM pengajuan_bengkel WHERE application_status = 'MENUNGGU'
     ORDER BY created_at`,
  );
  res.json({ applications });
});

app.patch('/api/admin/workshop-applications/:id', authenticate, allowRoles('SUPER_ADMIN'), async (req, res) => {
  const applicationId = Number(req.params.id);
  const action = req.body.action;
  if (!Number.isInteger(applicationId) || !['APPROVE', 'REJECT'].includes(action)) {
    throw new HttpError(400, 'Pengajuan atau tindakan tidak valid.');
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[application]] = await connection.execute(
      `SELECT application_id, full_name, phone_number, password_hash, workshop_name,
              address, subscription_plan, application_status
       FROM pengajuan_bengkel WHERE application_id = ? FOR UPDATE`,
      [applicationId],
    );
    if (!application) throw new HttpError(404, 'Pengajuan bengkel tidak ditemukan.');
    if (application.application_status !== 'MENUNGGU') {
      throw new HttpError(409, 'Pengajuan ini sudah ditinjau.');
    }

    if (action === 'REJECT') {
      await connection.execute(
        `UPDATE pengajuan_bengkel
         SET application_status = 'DITOLAK', password_hash = NULL,
             reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE application_id = ?`,
        [req.auth.sub, applicationId],
      );
      await connection.commit();
      return res.json({ application_id: applicationId, application_status: 'DITOLAK' });
    }

    if (!application.password_hash) {
      throw new HttpError(409, 'Pengajuan ini tidak memiliki kata sandi akun yang valid.');
    }
    const location = parseCoordinates(req.body.lat, req.body.lng);
    const [workshopResult] = await connection.execute(
      `INSERT INTO bengkel
        (workshop_name, phone_number, address, location, approval_status, subscription_plan)
       VALUES (?, ?, ?, ST_GeomFromText(?, 4326), 'AKTIF', ?)`,
      [
        application.workshop_name,
        application.phone_number,
        application.address,
        pointWkt(location),
        application.subscription_plan,
      ],
    );
    await connection.execute(
      `INSERT INTO akun (full_name, phone_number, password_hash, role, workshop_id)
       VALUES (?, ?, ?, 'ADMIN_BENGKEL', ?)`,
      [application.full_name, application.phone_number, application.password_hash, workshopResult.insertId],
    );
    await connection.execute(
      `UPDATE pengajuan_bengkel
       SET application_status = 'DISETUJUI', password_hash = NULL, workshop_id = ?,
           reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE application_id = ?`,
      [workshopResult.insertId, req.auth.sub, applicationId],
    );
    await connection.commit();
    res.json({
      application_id: applicationId,
      application_status: 'DISETUJUI',
      workshop_id: workshopResult.insertId,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.post('/api/admin/workshops', authenticate, allowRoles('SUPER_ADMIN'), async (req, res) => {
  const name = requireValue(req.body.workshopName, 'Nama bengkel');
  const phone = requireValue(req.body.phone, 'Nomor telepon bengkel');
  const address = requireValue(req.body.address, 'Alamat bengkel');
  const location = parseCoordinates(req.body.lat, req.body.lng);
  const [result] = await pool.execute(
    `INSERT INTO bengkel (workshop_name, phone_number, address, location, approval_status)
     VALUES (?, ?, ?, ST_GeomFromText(?, 4326), 'AKTIF')`,
    [name, phone, address, pointWkt(location)],
  );
  res.status(201).json({ workshop_id: result.insertId, workshop_name: name, location });
});

app.patch('/api/admin/workshops/:id', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const workshopId = Number(req.params.id);
  requireAdminWorkshop(req, workshopId);
  const name = requireValue(req.body.workshopName, 'Nama bengkel');
  const phone = requireValue(req.body.phone, 'Nomor telepon bengkel');
  const address = requireValue(req.body.address, 'Alamat bengkel');
  const location = parseCoordinates(req.body.lat, req.body.lng);
  const [result] = await pool.execute(
    `UPDATE bengkel SET workshop_name = ?, phone_number = ?, address = ?,
      location = ST_GeomFromText(?, 4326) WHERE workshop_id = ?`,
    [name, phone, address, pointWkt(location), workshopId],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Bengkel tidak ditemukan.');
  res.json({ workshop_id: workshopId, workshop_name: name, location });
});

app.get('/api/admin/mechanics', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const where = req.auth.role === 'SUPER_ADMIN' ? '' : 'WHERE m.workshop_id = ?';
  const params = req.auth.role === 'SUPER_ADMIN' ? [] : [req.auth.workshopId];
  const [rows] = await pool.execute(
    `SELECT m.mechanic_id, m.workshop_id, m.full_name, m.phone_number, m.status_active,
            b.workshop_name, ST_AsText(m.current_location, 'axis-order=long-lat') AS location_wkt
     FROM mekanik m JOIN bengkel b ON b.workshop_id = m.workshop_id ${where}
     ORDER BY m.full_name`,
    params,
  );
  res.json({ mechanics: rows.map((row) => {
    const { location_wkt, ...mechanic } = row;
    return { ...mechanic, location: pointFromWkt(location_wkt) };
  }) });
});

app.post('/api/admin/mechanics', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const fullName = requireValue(req.body.fullName, 'Nama montir');
  const phone = requireValue(req.body.phone, 'Nomor telepon montir');
  const workshopId = req.auth.role === 'ADMIN_BENGKEL'
    ? Number(req.auth.workshopId)
    : Number(req.body.workshopId);
  if (!Number.isInteger(workshopId)) throw new HttpError(400, 'Pilih bengkel untuk montir.');
  requireAdminWorkshop(req, workshopId);
  const hasLatitude = req.body.lat !== undefined && req.body.lat !== '';
  const hasLongitude = req.body.lng !== undefined && req.body.lng !== '';
  if (hasLatitude !== hasLongitude) throw new HttpError(400, 'Latitude dan longitude harus diisi bersama.');

  let result;
  if (hasLatitude) {
    const location = parseCoordinates(req.body.lat, req.body.lng);
    [result] = await pool.execute(
      `INSERT INTO mekanik (workshop_id, full_name, phone_number, status_active, current_location)
       SELECT workshop_id, ?, ?, 'SIAGA', ST_GeomFromText(?, 4326)
       FROM bengkel WHERE workshop_id = ? AND approval_status = 'AKTIF'`,
      [fullName, phone, pointWkt(location), workshopId],
    );
  } else {
    [result] = await pool.execute(
      `INSERT INTO mekanik (workshop_id, full_name, phone_number, status_active, current_location)
       SELECT workshop_id, ?, ?, 'SIAGA', location
       FROM bengkel WHERE workshop_id = ? AND approval_status = 'AKTIF'`,
      [fullName, phone, workshopId],
    );
  }
  if (!result.affectedRows) throw new HttpError(404, 'Bengkel aktif tidak ditemukan.');
  res.status(201).json({ mechanic_id: result.insertId, full_name: fullName, status_active: 'SIAGA' });
});

app.patch('/api/admin/mechanics/:id', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const mechanicId = Number(req.params.id);
  const [[mechanic]] = await pool.execute('SELECT workshop_id FROM mekanik WHERE mechanic_id = ?', [mechanicId]);
  if (!mechanic) throw new HttpError(404, 'Montir tidak ditemukan.');
  requireAdminWorkshop(req, mechanic.workshop_id);
  const status = req.body.status;
  if (!['SIAGA', 'SIBUK', 'OFFLINE'].includes(status)) {
    throw new HttpError(400, 'Status montir tidak valid.');
  }
  if (req.body.lat !== undefined || req.body.lng !== undefined) {
    const location = parseCoordinates(req.body.lat, req.body.lng);
    await pool.execute(
      `UPDATE mekanik SET status_active = ?, current_location = ST_GeomFromText(?, 4326)
       WHERE mechanic_id = ?`,
      [status, pointWkt(location), mechanicId],
    );
  } else {
    await pool.execute('UPDATE mekanik SET status_active = ? WHERE mechanic_id = ?', [status, mechanicId]);
  }
  res.json({ mechanic_id: mechanicId, status_active: status });
});

app.get('/api/admin/zones', authenticate, allowRoles('SUPER_ADMIN'), async (_req, res) => {
  const [zones] = await pool.execute(
    `SELECT zone_id, zone_name, base_rate, rate_per_km
     FROM zona_geofence ORDER BY zone_id`,
  );
  res.json({ zones });
});

app.patch('/api/admin/zones/:id', authenticate, allowRoles('SUPER_ADMIN'), async (req, res) => {
  const zoneId = Number(req.params.id);
  const baseRate = Number(req.body.baseRate);
  const ratePerKm = Number(req.body.ratePerKm);
  if (!Number.isInteger(zoneId) || !Number.isFinite(baseRate) || baseRate < 0 ||
      !Number.isFinite(ratePerKm) || ratePerKm < 0) {
    throw new HttpError(400, 'Zona atau tarif tidak valid.');
  }
  const [result] = await pool.execute(
    'UPDATE zona_geofence SET base_rate = ?, rate_per_km = ? WHERE zone_id = ?',
    [baseRate, ratePerKm, zoneId],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Zona tarif tidak ditemukan.');
  res.json({ zone_id: zoneId, base_rate: baseRate, rate_per_km: ratePerKm });
});

app.post('/api/admin/accounts', authenticate, allowRoles('SUPER_ADMIN'), async (req, res) => {
  const fullName = requireValue(req.body.fullName, 'Nama');
  const phone = requireValue(req.body.phone, 'Nomor telepon');
  const role = req.body.role;
  const workshopId = req.body.workshopId ? Number(req.body.workshopId) : null;
  if (!['ADMIN_BENGKEL', 'SUPER_ADMIN'].includes(role) ||
      (role === 'ADMIN_BENGKEL' && !Number.isInteger(workshopId))) {
    throw new HttpError(400, 'Peran atau bengkel untuk akun admin tidak valid.');
  }
  const passwordHash = await hashPassword(req.body.password);
  const [result] = await pool.execute(
    `INSERT INTO akun (full_name, phone_number, password_hash, role, workshop_id)
     VALUES (?, ?, ?, ?, ?)`,
    [fullName, phone, passwordHash, role, workshopId],
  );
  res.status(201).json({ account_id: result.insertId, full_name: fullName, phone_number: phone, role });
});

app.post('/api/admin/services', authenticate, allowRoles('ADMIN_BENGKEL', 'SUPER_ADMIN'), async (req, res) => {
  const workshopId = Number(req.body.workshopId);
  requireAdminWorkshop(req, workshopId);
  const name = requireValue(req.body.serviceName, 'Nama layanan');
  const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 255) : null;
  const basePrice = Number(req.body.basePrice);
  if (!Number.isFinite(basePrice) || basePrice < 0) throw new HttpError(400, 'Harga layanan tidak valid.');
  const [result] = await pool.execute(
    `INSERT INTO layanan_bengkel (workshop_id, service_name, description, base_price)
     VALUES (?, ?, ?, ?)`,
    [workshopId, name, description, basePrice],
  );
  res.status(201).json({ service_id: result.insertId, service_name: name, base_price: basePrice });
});

app.use((_req, _res, next) => next(new HttpError(404, 'Endpoint tidak ditemukan.')));
app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Nomor telepon atau data unik tersebut sudah terdaftar.' });
  }
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Data terkait tidak ditemukan. Periksa kembali pilihan Anda.' });
  }
  console.error(error);
  res.status(500).json({ error: 'Terjadi kesalahan server. Periksa log API untuk detailnya.' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Titik Kunci API berjalan pada http://localhost:${port}`);
});
