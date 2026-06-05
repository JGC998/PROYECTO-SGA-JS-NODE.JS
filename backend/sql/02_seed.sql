-- ============================================================
-- SGA LIN — Datos de ejemplo para desarrollo local
-- ============================================================

USE SGALIN;
GO

-- ── ALMACENES ────────────────────────────────────────────────
DELETE FROM ALMACENES;
INSERT INTO ALMACENES VALUES ('A1', 'Almacén Principal');
INSERT INTO ALMACENES VALUES ('A2', 'Almacén Auxiliar');
GO

-- ── EMPRESA ──────────────────────────────────────────────────
DELETE FROM EMPRESA;
INSERT INTO EMPRESA VALUES ('LIN', 'Empresa Ejemplo SL', '', 0);
GO

-- ── SUBFAMILIAS ───────────────────────────────────────────────
DELETE FROM SUBFAMILIA;
INSERT INTO SUBFAMILIA VALUES ('FIJA','Ferretería fija');
INSERT INTO SUBFAMILIA VALUES ('ELEC','Electricidad');
INSERT INTO SUBFAMILIA VALUES ('FONT','Fontanería');
INSERT INTO SUBFAMILIA VALUES ('HERR','Herramientas');
GO

-- ── CLIENTES ─────────────────────────────────────────────────
DELETE FROM CLIENTE;
INSERT INTO CLIENTE VALUES ('CLI001', 'Construcciones López SA',  'Construcciones López SA');
INSERT INTO CLIENTE VALUES ('CLI002', 'Reformas García SL',       'Reformas García SL');
INSERT INTO CLIENTE VALUES ('CLI003', 'Obras Martínez',           'Obras Martínez Hermanos');
INSERT INTO CLIENTE VALUES ('CLI004', 'Instalaciones Pérez',      'Instalaciones Pérez CB');
GO

-- ── PROVEEDORES ──────────────────────────────────────────────
DELETE FROM PROVEEDOR;
INSERT INTO PROVEEDOR VALUES ('PRO001', 'Suministros Industriales SA', 'Suministros Industriales SA');
INSERT INTO PROVEEDOR VALUES ('PRO002', 'Distribuciones Metal SL',     'Distribuciones Metal SL');
INSERT INTO PROVEEDOR VALUES ('PRO003', 'Ferretería Mayorista CB',      'Ferretería Mayorista CB');
GO

-- ── USUARIOS ─────────────────────────────────────────────────
DELETE FROM SGAUSUARIO;
INSERT INTO SGAUSUARIO VALUES ('admin',   'Administrador',       'A', '9');
INSERT INTO SGAUSUARIO VALUES ('juan',    'Juan García',         'U', '5');
INSERT INTO SGAUSUARIO VALUES ('paco',    'Paco Gómez',          'U', '5');
INSERT INTO SGAUSUARIO VALUES ('operario1','Operario Uno',       'O', '1');
INSERT INTO SGAUSUARIO VALUES ('operario2','Operario Dos',       'O', '1');
GO

-- ── ARTÍCULOS ─────────────────────────────────────────────────
DELETE FROM ARTICULO;
INSERT INTO ARTICULO(ARTCOD,ARTNOM,ARTCOD2,ARTGRUCOD,ARTSTOMIN,ARTSTOMAX,ARTMEDCOD) VALUES
('TORN-M6-10','Tornillo M6x10mm Zinc','T610','FIJA',50,500,'UNI'),
('TORN-M6-20','Tornillo M6x20mm Zinc','T620','FIJA',50,500,'UNI'),
('TORN-M8-16','Tornillo M8x16mm Acero','T816','FIJA',30,300,'UNI'),
('TURC-M6',   'Tuerca M6 Zinc',        'TU6', 'FIJA',50,500,'UNI'),
('TURC-M8',   'Tuerca M8 Zinc',        'TU8', 'FIJA',30,300,'UNI'),
('ARAN-M6',   'Arandela M6 Plana',     'AR6', 'FIJA',100,1000,'UNI'),
('ARAN-M8',   'Arandela M8 Plana',     'AR8', 'FIJA',100,1000,'UNI'),
('CLAVIJA-8', 'Clavija Fischer 8mm',   'CF8', 'FIJA',200,2000,'UNI'),
('CLAVIJA-10','Clavija Fischer 10mm',  'CF10','FIJA',100,1000,'UNI'),
('TALADRO-18','Taladro Percutor 18V',  'TP18','HERR',2,20,'UNI'),
('NIVEL-60',  'Nivel Burbuja 60cm',    'NB60','HERR',3,30,'UNI'),
('LLAVE-10',  'Llave Combinada 10mm',  'LC10','HERR',5,50,'UNI'),
('LLAVE-13',  'Llave Combinada 13mm',  'LC13','HERR',5,50,'UNI'),
('CABLE-16',  'Cable Eléctrico 1.5mm 100m','CE15','ELEC',5,50,'ROL'),
('CABLE-25',  'Cable Eléctrico 2.5mm 100m','CE25','ELEC',5,50,'ROL'),
('INTERR-10', 'Interruptor 10A Blanco','IN10','ELEC',10,100,'UNI'),
('ENCHUFE-16','Enchufe 16A Schuko',    'ENC16','ELEC',10,100,'UNI'),
('TUBO-32',   'Tubo PVC 32mm 3m',      'TPV32','FONT',10,80,'UNI'),
('TUBO-50',   'Tubo PVC 50mm 3m',      'TPV50','FONT',8,60,'UNI'),
('CODO-32',   'Codo PVC 32mm 90°',     'CPV32','FONT',20,200,'UNI');
GO

-- ── UBICACIONES ───────────────────────────────────────────────
DELETE FROM UBICACION;
INSERT INTO UBICACION(UBICODUBI,UBIETI,UBINOM,UBIANC,UBIALT,UBINUMPAL,UBIMUL,UBIALMCOD,UBILIB) VALUES
('P01-A-01','P01A01','Pasillo 1 Lado A Nivel 1',1.2,0.5,1,0,'A1',1),
('P01-A-02','P01A02','Pasillo 1 Lado A Nivel 2',1.2,0.5,1,0,'A1',0),
('P01-A-03','P01A03','Pasillo 1 Lado A Nivel 3',1.2,0.5,1,0,'A1',0),
('P01-B-01','P01B01','Pasillo 1 Lado B Nivel 1',1.2,0.5,1,0,'A1',1),
('P01-B-02','P01B02','Pasillo 1 Lado B Nivel 2',1.2,0.5,1,0,'A1',0),
('P01-B-03','P01B03','Pasillo 1 Lado B Nivel 3',1.2,0.5,1,0,'A1',0),
('P02-A-01','P02A01','Pasillo 2 Lado A Nivel 1',1.2,0.5,1,1,'A1',1),
('P02-A-02','P02A02','Pasillo 2 Lado A Nivel 2',1.2,0.5,1,0,'A1',0),
('P02-B-01','P02B01','Pasillo 2 Lado B Nivel 1',1.2,0.5,1,1,'A1',1),
('P02-B-02','P02B02','Pasillo 2 Lado B Nivel 2',1.2,0.5,1,0,'A1',0),
('P03-A-01','P03A01','Pasillo 3 Lado A Nivel 1',1.5,0.6,2,0,'A1',1),
('P03-A-02','P03A02','Pasillo 3 Lado A Nivel 2',1.5,0.6,2,0,'A1',0),
('P03-B-01','P03B01','Pasillo 3 Lado B Nivel 1',1.5,0.6,2,0,'A1',1),
('P03-B-02','P03B02','Pasillo 3 Lado B Nivel 2',1.5,0.6,2,0,'A1',0),
('RECEP',   'RECEP', 'Zona de Recepción',       3.0,0.0,0,1,'A1',1),
('EXPEDI',  'EXPEDI','Zona de Expedición',       3.0,0.0,0,1,'A1',1),
('DEVOL',   'DEVOL', 'Zona de Devoluciones',     2.0,0.0,0,1,'A1',1);
GO

-- ── STOCK ─────────────────────────────────────────────────────
DELETE FROM STOCK;
INSERT INTO STOCK(STOARTCOD,STOUBI,STOLOT,STOCAN) VALUES
('TORN-M6-10','P01-A-01','',350),
('TORN-M6-20','P01-A-02','',220),
('TORN-M8-16','P01-A-03','',180),
('TURC-M6',   'P01-B-01','',280),
('TURC-M8',   'P01-B-02','',90),
('ARAN-M6',   'P01-B-03','',650),
('ARAN-M8',   'P02-A-01','',420),
('CLAVIJA-8', 'P02-A-02','',1200),
('CLAVIJA-10','P02-B-01','',380),
('TALADRO-18','P03-A-01','',8),
('NIVEL-60',  'P03-A-02','',12),
('LLAVE-10',  'P03-B-01','',35),
('LLAVE-13',  'P03-B-02','',28),
('CABLE-16',  'P02-B-02','LOT-2024-01',22),
('CABLE-25',  'P02-B-02','LOT-2024-02',15),
('INTERR-10', 'P03-A-01','',60),
('ENCHUFE-16','P03-A-02','',45),
('TUBO-32',   'P03-B-01','',30),
('TUBO-50',   'P03-B-02','',18),
('CODO-32',   'P01-A-01','',95),
-- artículos con stock bajo mínimo (para probar alertas)
('TURC-M8','P02-A-01','',5),  -- 5+90=95, mínimo 30, OK
('LLAVE-10','P03-A-01','',2); -- 2+35=37, mínimo 5, OK — pero TALADRO-18 tiene 8, mínimo 2
GO

-- ── MÍNIMOS Y MÁXIMOS GLOBALES ────────────────────────────────
DELETE FROM ARTICULOSTOMIN;
INSERT INTO ARTICULOSTOMIN(MINARTCOD,MINSTOMIN,MINSTOMAX) VALUES
('TORN-M6-10',50,500),
('TORN-M6-20',50,500),
('TORN-M8-16',30,300),
('TURC-M6',50,500),
('TURC-M8',30,300),
('ARAN-M6',100,1000),
('ARAN-M8',100,1000),
('CLAVIJA-8',200,2000),
('CLAVIJA-10',100,1000),
('CABLE-16',10,50),
('CABLE-25',10,50);
GO

-- ── ASIGNACIONES ARTÍCULO-UBICACIÓN ─────────────────────────
DELETE FROM ARTICULOUBI;
INSERT INTO ARTICULOUBI(ARTUBICODUBI,ARTUBIARTCOD,ARTUBIMIN,ARTUBIMAX,ARTUBIEXC,ARTUBIALMCOD) VALUES
('P01-A-01','TORN-M6-10',100,500,0,'A1'),
('P01-A-01','CODO-32',20,200,0,'A1'),
('P01-A-02','TORN-M6-20',100,500,0,'A1'),
('P01-A-03','TORN-M8-16',50,300,0,'A1'),
('P01-B-01','TURC-M6',100,500,0,'A1'),
('P01-B-02','TURC-M8',50,300,0,'A1'),
('P01-B-03','ARAN-M6',200,1000,0,'A1'),
('P02-A-01','ARAN-M8',100,800,0,'A1'),
('P02-A-02','CLAVIJA-8',300,2000,0,'A1'),
('P02-B-01','CLAVIJA-10',100,1000,0,'A1'),
('P02-B-02','CABLE-16',10,50,0,'A1'),
('P02-B-02','CABLE-25',10,50,0,'A1'),
('P03-A-01','TALADRO-18',2,20,0,'A1'),
('P03-A-01','INTERR-10',20,100,0,'A1'),
('P03-A-02','NIVEL-60',3,30,0,'A1'),
('P03-A-02','ENCHUFE-16',20,100,0,'A1'),
('P03-B-01','LLAVE-10',10,50,0,'A1'),
('P03-B-01','TUBO-32',15,80,0,'A1'),
('P03-B-02','LLAVE-13',10,50,0,'A1'),
('P03-B-02','TUBO-50',10,60,0,'A1');
GO

-- ── MOVIMIENTOS DE EJEMPLO ────────────────────────────────────
DELETE FROM ALBARANCS;
-- Entradas recientes
INSERT INTO ALBARANCS(ACSEMPCOD,ACSSER,ACSNUM,ACSMOV,ACSFEC,ACSARTCOD,ACSUBI,ACSLOT,ACSCAN,ACSCLICOD,ACSCLINOM) VALUES
('LIN','ENT',1001,'E',DATEADD(day,-10,GETDATE()),'TORN-M6-10','P01-A-01','',200,'PRO001','Suministros Industriales SA'),
('LIN','ENT',1001,'E',DATEADD(day,-10,GETDATE()),'TORN-M6-20','P01-A-02','',150,'PRO001','Suministros Industriales SA'),
('LIN','ENT',1002,'E',DATEADD(day,-5,GETDATE()),'ARAN-M6',   'P01-B-03','',400,'PRO002','Distribuciones Metal SL'),
('LIN','ENT',1002,'E',DATEADD(day,-5,GETDATE()),'ARAN-M8',   'P02-A-01','',300,'PRO002','Distribuciones Metal SL'),
('LIN','ENT',1003,'E',DATEADD(day,-2,GETDATE()),'CABLE-16',  'P02-B-02','LOT-2024-01',20,'PRO003','Ferretería Mayorista CB'),
('LIN','ENT',1003,'E',DATEADD(day,-2,GETDATE()),'CABLE-25',  'P02-B-02','LOT-2024-02',15,'PRO003','Ferretería Mayorista CB');

-- Salidas (expediciones)
INSERT INTO ALBARANCS(ACSEMPCOD,ACSSER,ACSNUM,ACSMOV,ACSFEC,ACSARTCOD,ACSUBI,ACSLOT,ACSCAN,ACSCLICOD,ACSCLINOM,ACSNUMPIC) VALUES
('LIN','EXP',2001,'PC',DATEADD(day,-8,GETDATE()),'TORN-M6-10','P01-A-01','',50,'CLI001','Construcciones López SA',101),
('LIN','EXP',2001,'PC',DATEADD(day,-8,GETDATE()),'TURC-M6',   'P01-B-01','',50,'CLI001','Construcciones López SA',101),
('LIN','EXP',2001,'PC',DATEADD(day,-8,GETDATE()),'ARAN-M6',   'P01-B-03','',100,'CLI001','Construcciones López SA',101),
('LIN','EXP',2002,'PC',DATEADD(day,-3,GETDATE()),'TALADRO-18','P03-A-01','',2,'CLI002','Reformas García SL',102),
('LIN','EXP',2002,'PC',DATEADD(day,-3,GETDATE()),'NIVEL-60',  'P03-A-02','',3,'CLI002','Reformas García SL',102),
('LIN','EXP',2003,'PC',DATEADD(day,-1,GETDATE()),'CABLE-16',  'P02-B-02','LOT-2024-01',5,'CLI003','Obras Martínez',103),
('LIN','EXP',2003,'PC',DATEADD(day,-1,GETDATE()),'INTERR-10', 'P03-A-01','',10,'CLI003','Obras Martínez',103);

-- Pedidos pendientes de picking (ACSMOV='E')
INSERT INTO ALBARANCS(ACSEMPCOD,ACSSER,ACSNUM,ACSMOV,ACSFEC,ACSARTCOD,ACSUBI,ACSLOT,ACSCAN,ACSCLICOD,ACSCLINOM,ACSNUMPIC) VALUES
('LIN','PED',3001,'E',GETDATE(),'LLAVE-10',   'P03-B-01','',5,'CLI004','Instalaciones Pérez',201),
('LIN','PED',3001,'E',GETDATE(),'LLAVE-13',   'P03-B-02','',5,'CLI004','Instalaciones Pérez',201),
('LIN','PED',3001,'E',GETDATE(),'CLAVIJA-8',  'P02-A-02','',20,'CLI004','Instalaciones Pérez',201),
('LIN','PED',3002,'E',GETDATE(),'TUBO-32',    'P03-B-01','',5,'CLI001','Construcciones López SA',202),
('LIN','PED',3002,'E',GETDATE(),'TUBO-50',    'P03-B-02','',3,'CLI001','Construcciones López SA',202),
('LIN','PED',3002,'E',GETDATE(),'CODO-32',    'P01-A-01','',10,'CLI001','Construcciones López SA',202);

-- Regularizaciones
INSERT INTO ALBARANCS(ACSEMPCOD,ACSSER,ACSNUM,ACSMOV,ACSFEC,ACSARTCOD,ACSUBI,ACSLOT,ACSCAN,ACSCLICOD,ACSCLINOM) VALUES
('LIN','REG',4001,'R',DATEADD(day,-15,GETDATE()),'TURC-M8','P01-B-02','',10,'','Ajuste inventario'),
('LIN','REG',4002,'R',DATEADD(day,-7,GETDATE()),'CLAVIJA-10','P02-B-01','',-5,'','Merma');
GO

-- ── CONTADOR ─────────────────────────────────────────────────
DELETE FROM CONTADOR;
INSERT INTO CONTADOR(CONNUM,REGMOD) VALUES (5000, 0);
GO

PRINT 'Datos de ejemplo insertados correctamente.';
GO
