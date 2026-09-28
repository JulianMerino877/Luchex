import { TestBed } from '@angular/core/testing';
import { TallerDataService } from './taller-data.service';
import { OrdenTrabajo, totalOrden, totalProductos } from './taller.models';

describe('TallerDataService: relación orden-venta', () => {
  const orden: OrdenTrabajo = {
    id: 'orden-1',
    folio: 'OT-2026-001',
    cliente: 'Ana',
    moto: 'Honda CB190',
    estado: 'listo',
    observaciones: '',
    servicios: [
      { id: 's1', nombre: 'Cambio de aceite', precio: 30 },
      { id: 's2', nombre: 'Limpieza de carburador', precio: 40 },
    ],
    manoObra: 15,
    fecha: '2026-09-20T12:00:00Z',
  };

  beforeEach(() => {
    localStorage.setItem('luchex-ordenes', JSON.stringify([orden]));
    localStorage.removeItem('luchex-ventas');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.removeItem('luchex-ordenes');
    localStorage.removeItem('luchex-ventas');
  });

  it('relaciona por ordenId sin copiar servicios ni repuestos', () => {
    const servicio = TestBed.inject(TallerDataService);
    const venta = servicio.crearVentaDesdeOrden(orden.id);

    expect(venta.ordenId).toBe(orden.id);
    expect(venta).not.toEqual(jasmine.objectContaining({ servicios: jasmine.anything() }));
    expect(servicio.crearVentaDesdeOrden(orden.id).id).toBe(venta.id);
    expect(servicio.ventas().length).toBe(1);
  });

  it('suma productos adicionales y al pagar actualiza la orden', () => {
    const servicio = TestBed.inject(TallerDataService);
    const venta = servicio.crearVentaDesdeOrden(orden.id);
    servicio.agregarProducto(venta.id, { nombre: 'Casco', cantidad: 1, precioUnitario: 120 });

    const actualizada = servicio.ventas()[0];
    expect(totalOrden(orden)).toBe(85);
    expect(totalProductos(actualizada)).toBe(120);
    expect(totalOrden(orden) + totalProductos(actualizada)).toBe(205);

    servicio.registrarPago(venta.id, 'yape');
    expect(servicio.ventas()[0].estado).toBe('pagada');
    expect(servicio.ventas()[0].metodoPago).toBe('yape');
    expect(servicio.ordenes()[0].estado).toBe('pagado');

    servicio.reabrirVenta(venta.id);
    expect(servicio.ventas()[0].estado).toBe('pendiente');
    expect(servicio.ventas()[0].metodoPago).toBeNull();
    expect(servicio.ordenes()[0].estado).toBe('listo');
  });

  it('permite una venta sin orden', () => {
    const servicio = TestBed.inject(TallerDataService);
    const venta = servicio.crearVentaDirecta('Luis', '');

    expect(venta.ordenId).toBeNull();
    expect(venta.cliente).toBe('Luis');
  });
});
