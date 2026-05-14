-- ============================================================================
-- Tabla satélite: SGA_PICKING_CONFIRMACION
-- Base de datos  : LIN (SQL Server)
-- Propósito      : Almacena confirmaciones SGA de líneas de picking.
--                  Desacoplada de ALBARANCS — no modifica nada legacy.
-- Reversible     : DROP TABLE SGA_PICKING_CONFIRMACION  (sin impacto en LIN)
-- ============================================================================

IF OBJECT_ID('SGA_PICKING_CONFIRMACION', 'U') IS NULL
BEGIN
    CREATE TABLE SGA_PICKING_CONFIRMACION (
        ID         INT          IDENTITY(1,1) NOT NULL
                                CONSTRAINT PK_SGA_PICKING_CONF PRIMARY KEY CLUSTERED,
        ALBARAN    INT          NOT NULL,
        SERIE      VARCHAR(10)  NOT NULL,
        ARTICULO   VARCHAR(30)  NOT NULL,
        UBICACION  VARCHAR(20)  NOT NULL,
        LOTE       VARCHAR(30)  NULL,
        OPERARIO   VARCHAR(50)  NULL,
        FECHA_CONF DATETIME     NOT NULL CONSTRAINT DF_SGA_PICKING_CONF_FECHA DEFAULT GETDATE()
    );

    -- Índice de búsqueda para el LEFT JOIN en GET /picking
    CREATE NONCLUSTERED INDEX IX_SGA_PICKING_CONF_LINEA
        ON SGA_PICKING_CONFIRMACION (ALBARAN, SERIE, ARTICULO, UBICACION);

    PRINT 'SGA_PICKING_CONFIRMACION creada correctamente.';
END
ELSE
BEGIN
    PRINT 'SGA_PICKING_CONFIRMACION ya existía. Sin cambios.';
END
