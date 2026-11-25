CREATE DATABASE IF NOT EXISTS `titikkunci_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE `titikkunci_db`;

SET NAMES utf8mb4;
SET time_zone = '+07:00';

CREATE TABLE `bengkel` (
  `workshop_id` int NOT NULL AUTO_INCREMENT,
  `workshop_name` varchar(120) NOT NULL,
  `phone_number` varchar(20) NOT NULL,
  `address` text NOT NULL,
  `location` point NOT NULL SRID 4326,
  `approval_status` enum('MENUNGGU','AKTIF','NONAKTIF') NOT NULL DEFAULT 'MENUNGGU',
  `opening_hours` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`workshop_id`),
  UNIQUE KEY `uq_bengkel_phone` (`phone_number`),
  SPATIAL KEY `sp_bengkel_location` (`location`),
  KEY `idx_bengkel_status` (`approval_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `akun` (
  `account_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `phone_number` varchar(20) NOT NULL,
  `password_hash` varchar(180) NOT NULL,
  `role` enum('PEMILIK','ADMIN_BENGKEL','SUPER_ADMIN') NOT NULL,
  `workshop_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uq_akun_phone` (`phone_number`),
  KEY `idx_akun_workshop` (`workshop_id`),
  CONSTRAINT `fk_akun_workshop` FOREIGN KEY (`workshop_id`) REFERENCES `bengkel` (`workshop_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pelanggan` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `phone_number` varchar(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_pelanggan_account` (`account_id`),
  UNIQUE KEY `uq_pelanggan_phone` (`phone_number`),
  CONSTRAINT `fk_pelanggan_account` FOREIGN KEY (`account_id`) REFERENCES `akun` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `kendaraan` (
  `vehicle_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `brand` varchar(60) NOT NULL,
  `model` varchar(80) NOT NULL,
  `plate_number` varchar(15) NOT NULL,
  `vehicle_type` enum('MOTOR','MOBIL') NOT NULL DEFAULT 'MOTOR',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vehicle_id`),
  UNIQUE KEY `uq_kendaraan_plate` (`plate_number`),
  KEY `idx_kendaraan_user` (`user_id`),
  CONSTRAINT `fk_kendaraan_pelanggan` FOREIGN KEY (`user_id`) REFERENCES `pelanggan` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `mekanik` (
  `mechanic_id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `phone_number` varchar(20) NOT NULL,
  `status_active` enum('SIAGA','SIBUK','OFFLINE') NOT NULL DEFAULT 'SIAGA',
  `current_location` point NOT NULL SRID 4326,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`mechanic_id`),
  UNIQUE KEY `uq_mekanik_phone` (`phone_number`),
  KEY `idx_mekanik_workshop_status` (`workshop_id`,`status_active`),
  SPATIAL KEY `sp_mekanik_location` (`current_location`),
  CONSTRAINT `fk_mekanik_bengkel` FOREIGN KEY (`workshop_id`) REFERENCES `bengkel` (`workshop_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `toko_sparepart` (
  `store_id` int NOT NULL AUTO_INCREMENT,
  `store_name` varchar(100) NOT NULL,
  `address` text NOT NULL,
  `location` point NOT NULL SRID 4326,
  PRIMARY KEY (`store_id`),
  SPATIAL KEY `sp_toko_location` (`location`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `layanan_bengkel` (
  `service_id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `service_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `base_price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`service_id`),
  UNIQUE KEY `uq_layanan_bengkel_nama` (`workshop_id`,`service_name`),
  CONSTRAINT `fk_layanan_bengkel` FOREIGN KEY (`workshop_id`) REFERENCES `bengkel` (`workshop_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `zona_geofence` (
  `zone_id` int NOT NULL AUTO_INCREMENT,
  `zone_name` varchar(100) NOT NULL,
  `base_rate` decimal(10,2) NOT NULL DEFAULT '10000.00',
  `rate_per_km` decimal(10,2) NOT NULL DEFAULT '3000.00',
  `boundary` polygon NOT NULL SRID 4326,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`zone_id`),
  SPATIAL KEY `sp_zona_boundary` (`boundary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pesanan_darurat` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `vehicle_id` int DEFAULT NULL,
  `mechanic_id` int DEFAULT NULL,
  `workshop_id` int DEFAULT NULL,
  `store_id` int DEFAULT NULL,
  `issue_description` varchar(500) NOT NULL,
  `incident_location` point NOT NULL SRID 4326,
  `route_line` linestring DEFAULT NULL SRID 4326,
  `distance_km` decimal(8,2) NOT NULL DEFAULT '0.00',
  `route_source` enum('OSRM','GARIS_LURUS','BELUM_TERSEDIA') NOT NULL DEFAULT 'BELUM_TERSEDIA',
  `total_cost` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payment_method` enum('TUNAI') NOT NULL DEFAULT 'TUNAI',
  `payment_status` enum('BELUM_DIBAYAR','TERCATAT') NOT NULL DEFAULT 'BELUM_DIBAYAR',
  `order_status` enum('PENDING','DITERIMA','DALAM_PERJALANAN','SEDANG_DIKERJAKAN','SELESAI','DIBATALKAN') NOT NULL DEFAULT 'PENDING',
  `cancellation_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  SPATIAL KEY `sp_pesanan_incident_location` (`incident_location`),
  KEY `idx_pesanan_user_created` (`user_id`,`created_at`),
  KEY `idx_pesanan_mechanic_status` (`mechanic_id`,`order_status`),
  KEY `idx_pesanan_workshop_status` (`workshop_id`,`order_status`),
  KEY `idx_pesanan_store` (`store_id`),
  CONSTRAINT `fk_pesanan_pelanggan` FOREIGN KEY (`user_id`) REFERENCES `pelanggan` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pesanan_kendaraan` FOREIGN KEY (`vehicle_id`) REFERENCES `kendaraan` (`vehicle_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pesanan_mekanik` FOREIGN KEY (`mechanic_id`) REFERENCES `mekanik` (`mechanic_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pesanan_bengkel` FOREIGN KEY (`workshop_id`) REFERENCES `bengkel` (`workshop_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pesanan_toko` FOREIGN KEY (`store_id`) REFERENCES `toko_sparepart` (`store_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `riwayat_pesanan` (
  `history_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `account_id` int DEFAULT NULL,
  `order_status` varchar(32) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_riwayat_order_created` (`order_id`,`created_at`),
  CONSTRAINT `fk_riwayat_pesanan` FOREIGN KEY (`order_id`) REFERENCES `pesanan_darurat` (`order_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_riwayat_akun` FOREIGN KEY (`account_id`) REFERENCES `akun` (`account_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `bengkel` (`workshop_id`,`workshop_name`,`phone_number`,`address`,`location`,`approval_status`,`opening_hours`) VALUES
(1,'Bengkel Titik Kunci Pangkalpinang','0717432100','Jl. Jenderal Sudirman, Pangkalpinang',ST_GeomFromText('POINT(-2.128712 106.113045)',4326),'AKTIF',JSON_OBJECT('senin','08:00-20:00','minggu','08:00-17:00')),
(2,'Bengkel Selindung Motor','0717432101','Jl. Raya Sungailiat, Selindung Baru',ST_GeomFromText('POINT(-2.098150 106.112400)',4326),'AKTIF',JSON_OBJECT('senin','08:00-18:00','minggu','TUTUP')),
(3,'Bengkel Central Motor','0717432102','Jl. Ahmad Yani, Pangkalpinang',ST_GeomFromText('POINT(-2.122000 106.108500)',4326),'AKTIF',JSON_OBJECT('senin','08:00-19:00','minggu','08:00-15:00'));

INSERT INTO `akun` (`account_id`,`full_name`,`phone_number`,`password_hash`,`role`,`workshop_id`) VALUES
(1,'Rizky Pratama','081271829301','scrypt$c10c6bb71618d2e7d19978ef2d4d5724$36f5bce65f1944c28ab0e5b3added751c1dcace520c4a226a6de80604289a572c5de1f627040d8645ac39aa870e292051bd248adcc592bc2d4cfd7bf2c9688a7','PEMILIK',NULL),
(2,'Admin Bengkel Titik Kunci','081234567801','scrypt$c10c6bb71618d2e7d19978ef2d4d5724$36f5bce65f1944c28ab0e5b3added751c1dcace520c4a226a6de80604289a572c5de1f627040d8645ac39aa870e292051bd248adcc592bc2d4cfd7bf2c9688a7','ADMIN_BENGKEL',1),
(3,'Super Admin','081234567800','scrypt$c10c6bb71618d2e7d19978ef2d4d5724$36f5bce65f1944c28ab0e5b3added751c1dcace520c4a226a6de80604289a572c5de1f627040d8645ac39aa870e292051bd248adcc592bc2d4cfd7bf2c9688a7','SUPER_ADMIN',NULL);

INSERT INTO `pelanggan` (`user_id`,`account_id`,`full_name`,`phone_number`) VALUES
(1,1,'Rizky Pratama','081271829301');

INSERT INTO `kendaraan` (`vehicle_id`,`user_id`,`brand`,`model`,`plate_number`,`vehicle_type`) VALUES
(1,1,'Honda','Vario 160','BN 1234 TK','MOTOR');

INSERT INTO `mekanik` (`mechanic_id`,`workshop_id`,`full_name`,`phone_number`,`status_active`,`current_location`) VALUES
(1,1,'Budi Santoso','081368123456','SIAGA',ST_GeomFromText('POINT(-2.128712 106.113045)',4326)),
(2,2,'Agus Prasetyo','082179882211','SIAGA',ST_GeomFromText('POINT(-2.098150 106.112400)',4326)),
(3,3,'Hendra Wijaya','085381229900','SIBUK',ST_GeomFromText('POINT(-2.082500 106.102100)',4326));

INSERT INTO `toko_sparepart` (`store_id`,`store_name`,`address`,`location`) VALUES
(1,'Toko Sparepart Motor Selindung','Jl. Raya Sungailiat - Pangkalpinang, Selindung Baru',ST_GeomFromText('POINT(-2.095200 106.111800)',4326)),
(2,'Bengkel & Sparepart Central Motor','Jl. Ahmad Yani, Pangkalpinang',ST_GeomFromText('POINT(-2.122000 106.108500)',4326)),
(3,'Toko Aki & Busi Balunijuk','Jl. Raya Balunijuk, Kec. Merawang',ST_GeomFromText('POINT(-2.085100 106.099500)',4326));

INSERT INTO `layanan_bengkel` (`workshop_id`,`service_name`,`description`,`base_price`) VALUES
(1,'Servis darurat','Pemeriksaan dan perbaikan di lokasi',25000),
(1,'Ganti aki','Penggantian aki kendaraan',15000),
(2,'Servis motor','Servis ringan di bengkel atau lokasi',20000),
(3,'Tambal ban','Perbaikan ban bocor',10000);

INSERT INTO `zona_geofence` (`zone_id`,`zone_name`,`base_rate`,`rate_per_km`,`boundary`) VALUES
(1,'Zona 1 - Kampus UBB & Balunijuk',8000,2500,ST_GeomFromText('POLYGON((-2.070000 106.090000,-2.070000 106.115000,-2.092000 106.115000,-2.092000 106.090000,-2.070000 106.090000))',4326)),
(2,'Zona 2 - Jalur Lintas Selindung-Pangkalpinang',12000,3000,ST_GeomFromText('POLYGON((-2.092000 106.095000,-2.092000 106.130000,-2.150000 106.130000,-2.150000 106.095000,-2.092000 106.095000))',4326));

INSERT INTO `pesanan_darurat` (`order_id`,`user_id`,`vehicle_id`,`mechanic_id`,`workshop_id`,`issue_description`,`incident_location`,`distance_km`,`route_source`,`total_cost`,`payment_status`,`order_status`,`created_at`,`accepted_at`,`completed_at`) VALUES
(1,1,1,2,2,'Motor mogok dan sulit dinyalakan',ST_GeomFromText('POINT(-2.091200 106.109800)',4326),1.25,'GARIS_LURUS',18500,'TERCATAT','SELESAI','2026-10-28 01:46:25','2026-10-28 01:50:00','2026-10-28 02:35:00'),
(2,1,1,1,1,'Ban belakang kempis',ST_GeomFromText('POINT(-2.115000 106.111000)',4326),2.33,'GARIS_LURUS',15000,'BELUM_DIBAYAR','DALAM_PERJALANAN','2026-10-28 01:46:25','2026-10-28 01:48:00',NULL);

INSERT INTO `riwayat_pesanan` (`order_id`,`account_id`,`order_status`,`note`,`created_at`) VALUES
(1,1,'PENDING','Permintaan bantuan dibuat','2026-10-28 01:46:25'),
(1,2,'DITERIMA','Montir menerima permintaan','2026-10-28 01:50:00'),
(1,2,'SELESAI','Layanan selesai; pembayaran tunai tercatat','2026-10-28 02:35:00'),
(2,1,'PENDING','Permintaan bantuan dibuat','2026-10-28 01:46:25'),
(2,2,'DALAM_PERJALANAN','Montir menuju lokasi','2026-10-28 01:48:00');

ALTER TABLE `bengkel` AUTO_INCREMENT=4;
ALTER TABLE `akun` AUTO_INCREMENT=4;
ALTER TABLE `pelanggan` AUTO_INCREMENT=2;
ALTER TABLE `kendaraan` AUTO_INCREMENT=2;
ALTER TABLE `mekanik` AUTO_INCREMENT=4;
ALTER TABLE `toko_sparepart` AUTO_INCREMENT=4;
ALTER TABLE `layanan_bengkel` AUTO_INCREMENT=5;
ALTER TABLE `zona_geofence` AUTO_INCREMENT=3;
ALTER TABLE `pesanan_darurat` AUTO_INCREMENT=3;
ALTER TABLE `riwayat_pesanan` AUTO_INCREMENT=6;
