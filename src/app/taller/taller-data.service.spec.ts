import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OrdenesService } from '../ordenes/ordenes.service';
import { TallerDataService } from './taller-data.service';
import { OrdenTrabajo, totalOrden, totalProductos } from './taller.models';

describe('TallerDataService: relación orden-venta', () => {
  let ordenesFirestore: {
    ordenes: ReturnType<typeof signal<OrdenTrabajo[]>>;
    cargando: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string>>;
    guardar: jasmine.Spy;
    actualizar: jasmine.Spy;
  };
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
    localStorage.setItem('luchex-ordenes-ventas-reiniciadas-v1', 'true');
    localStorage.removeItem('luchex-ventas');
    const ordenes = signal<OrdenTrabajo[]>([orden]);
    ordenesFirestore = {
      ordenes,
      cargando: signal(false),
      error: signal(''),
      guardar: jasmine.createSpy('guardar'),
      actualizar: jasmine.createSpy('actualizar').and.callFake(async (actualizada: OrdenTrabajo) => {
        ordenes.update(lista => lista.map(item => item.id === actualizada.id ? actualizada : item));
      }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: OrdenesService, useValue: ordenesFirestore }] });
  });

  afterEach(() => {
    localStorage.removeItem('luchex-ventas');
    localStorage.removeItem('luchex-ordenes-ventas-reiniciadas-v1');
  });

  it('relaciona por ordenId sin copiar servicios ni repuestos', () => {
    const servicio = TestBed.inject(TallerDataService);
    const venta = servicio.crearVentaDesdeOrden(orden.id);

    expect(venta.ordenId).toBe(orden.id);
    expect(venta).not.toEqual(jasmine.objectContaining({ servicios: jasmine.anything() }));
    expect(servicio.crearVentaDesdeOrden(orden.id).id).toBe(venta.id);
    expect(servicio.ventas().length).toBe(1);
  });

  it('suma productos adicionales y al pagar actualiza la orden', async () => {
    const servicio = TestBed.inject(TallerDataService);
    const venta = servicio.crearVentaDesdeOrden(orden.id);
    servicio.agregarProducto(venta.id, { nombre: 'Casco', cantidad: 1, precioUnitario: 120 });

    const actualizada = servicio.ventas()[0];
    expect(totalOrden(orden)).toBe(85);
    expect(totalProductos(actualizada)).toBe(120);
    expect(totalOrden(orden) + totalProductos(actualizada)).toBe(205);

    await servicio.registrarPago(venta.id, 'yape');
    expect(servicio.ventas()[0].estado).toBe('pagada');
    expect(servicio.ventas()[0].metodoPago).toBe('yape');
    expect(servicio.ordenes()[0].estado).toBe('pagado');

    await servicio.reabrirVenta(venta.id);
    expect(servicio.ventas()[0].estado).toBe('pendiente');
    expect(servicio.ventas()[0].metodoPago).toBeNull();
    expect(servicio.ordenes()[0].estado).toBe('listo');
    expect(ordenesFirestore.actualizar).toHaveBeenCalledTimes(2);
  });

  it('permite una venta sin orden', () => {
    const servicio = TestBed.inject(TallerDataService);
    const venta = servicio.crearVentaDirecta('Luis');

    expect(venta.ordenId).toBeNull();
    expect(venta.cliente).toBe('Luis');
  });
});
