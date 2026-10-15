import { inject, Injectable, signal } from '@angular/core';
import { OrdenesService } from '../ordenes/ordenes.service';
import { MetodoPago, OrdenTrabajo, ProductoVenta, Venta } from './taller.models';

const VENTAS_KEY = 'luchex-ventas';
const DATOS_REINICIADOS_KEY = 'luchex-ordenes-ventas-reiniciadas-v1';

@Injectable({ providedIn: 'root' })
export class TallerDataService {
  private readonly ordenesFirestore = inject(OrdenesService);
  readonly ordenes = this.ordenesFirestore.ordenes;
  readonly cargandoOrdenes = this.ordenesFirestore.cargando;
  readonly errorOrdenes = this.ordenesFirestore.error;
  readonly ventas = signal<Venta[]>(this.leerVentasIniciales());

  async guardarOrden(orden: OrdenTrabajo, editando: boolean): Promise<void> {
    await this.ordenesFirestore.guardar(orden, editando);
  }

  async actualizarOrden(orden: OrdenTrabajo): Promise<void> {
    await this.ordenesFirestore.actualizar(orden);
  }

  ventaPorOrden(ordenId: string): Venta | undefined {
    return this.ventas().find(venta => venta.ordenId === ordenId);
  }

  crearVentaDesdeOrden(ordenId: string): Venta {
    const existente = this.ventaPorOrden(ordenId);
    if (existente) return existente;
    const orden = this.ordenes().find(item => item.id === ordenId);
    if (!orden) throw new Error('La orden ya no existe.');
    if (orden.estado !== 'listo') throw new Error('La orden debe estar en estado Listo antes de enviarla a Ventas.');

    const venta = this.nuevaVenta(ordenId, '', '');
    this.ventas.update(ventas => [venta, ...ventas]);
    this.persistirVentas();
    return venta;
  }

  crearVentaDirecta(cliente: string): Venta {
    const venta = this.nuevaVenta(null, cliente.trim(), '');
    this.ventas.update(ventas => [venta, ...ventas]);
    this.persistirVentas();
    return venta;
  }

  agregarProducto(ventaId: string, producto: Omit<ProductoVenta, 'id'>): void {
    const limpio: ProductoVenta = {
      ...producto,
      id: this.crearId(),
      nombre: producto.nombre.trim(),
      cantidad: this.numeroPositivo(producto.cantidad),
      precioUnitario: this.numeroPositivo(producto.precioUnitario),
    };
    if (!limpio.nombre || !limpio.cantidad) throw new Error('Completa el producto y su cantidad.');
    this.ventas.update(ventas => ventas.map(venta => venta.id === ventaId
      ? { ...venta, productos: [...venta.productos, limpio] }
      : venta));
    this.persistirVentas();
  }

  agregarProductoVacio(ventaId: string): void {
    this.ventas.update(ventas => ventas.map(venta => venta.id === ventaId
      ? { ...venta, productos: [...venta.productos, {
        id: this.crearId(), nombre: '', cantidad: 1, precioUnitario: 0,
      }] }
      : venta));
    this.persistirVentas();
  }

  actualizarProducto(
    ventaId: string,
    productoId: string,
    campo: 'nombre' | 'cantidad' | 'precioUnitario',
    valor: string | number,
  ): void {
    this.ventas.update(ventas => ventas.map(venta => venta.id === ventaId
      ? {
        ...venta,
        productos: venta.productos.map(producto => producto.id === productoId
          ? { ...producto, [campo]: campo === 'nombre' ? String(valor) : this.numeroPositivo(Number(valor)) }
          : producto),
      }
      : venta));
    this.persistirVentas();
  }

  quitarProducto(ventaId: string, productoId: string): void {
    this.ventas.update(ventas => ventas.map(venta => venta.id === ventaId
      ? { ...venta, productos: venta.productos.filter(producto => producto.id !== productoId) }
      : venta));
    this.persistirVentas();
  }

  actualizarMetodoPago(ventaId: string, metodoPago: MetodoPago | null): void {
    this.ventas.update(ventas => ventas.map(venta => venta.id === ventaId
      ? { ...venta, metodoPago }
      : venta));
    this.persistirVentas();
  }

  async registrarPago(ventaId: string, metodoPago: MetodoPago = 'efectivo'): Promise<void> {
    const venta = this.ventas().find(item => item.id === ventaId);
    if (!venta) throw new Error('La venta ya no existe.');
    if (venta.estado === 'pagada') return;
    if (venta.productos.some(producto => !producto.nombre.trim() || producto.cantidad <= 0)) {
      throw new Error('Completa el nombre y la cantidad de todos los productos.');
    }
    const pagadaEn = new Date().toISOString();
    if (venta.ordenId) {
      const orden = this.ordenes().find(item => item.id === venta.ordenId);
      if (!orden) throw new Error('La orden asociada ya no existe.');
      await this.actualizarOrden({ ...orden, estado: 'pagado' });
    }
    this.ventas.update(ventas => ventas.map(item => item.id === ventaId
      ? { ...item, estado: 'pagada', metodoPago, pagadaEn }
      : item));
    this.persistirVentas();
  }

  async reabrirVenta(ventaId: string): Promise<void> {
    const venta = this.ventas().find(item => item.id === ventaId);
    if (!venta || venta.estado === 'pendiente') return;
    if (venta.ordenId) {
      const orden = this.ordenes().find(item => item.id === venta.ordenId);
      if (!orden) throw new Error('La orden asociada ya no existe.');
      await this.actualizarOrden({ ...orden, estado: 'listo' });
    }
    this.ventas.update(ventas => ventas.map(item => item.id === ventaId
      ? { ...item, estado: 'pendiente', metodoPago: null, pagadaEn: null }
      : item));
    this.persistirVentas();
  }

  private nuevaVenta(ordenId: string | null, cliente: string, moto: string): Venta {
    const siguiente = this.ventas().length + 1;
    return {
      id: this.crearId(),
      folio: `V-${new Date().getFullYear()}-${String(siguiente).padStart(3, '0')}`,
      ordenId,
      cliente,
      moto,
      productos: [],
      estado: 'pendiente',
      metodoPago: null,
      fecha: new Date().toISOString(),
      pagadaEn: null,
    };
  }

  private leerVentas(): Venta[] {
    return this.leer<Array<Omit<Venta, 'metodoPago'> & { metodoPago?: MetodoPago | 'tarjeta' | null }>>(VENTAS_KEY, []).map(venta => {
      const metodoPago = venta.metodoPago === 'tarjeta' ? 'efectivo' : venta.metodoPago ?? null;
      return { ...venta, productos: Array.isArray(venta.productos) ? venta.productos : [], metodoPago };
    });
  }

  private leerVentasIniciales(): Venta[] {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(DATOS_REINICIADOS_KEY)) {
      localStorage.removeItem(VENTAS_KEY);
      localStorage.setItem(DATOS_REINICIADOS_KEY, 'true');
    }
    return this.leerVentas();
  }

  private leer<T>(clave: string, predeterminado: T): T {
    if (typeof localStorage === 'undefined') return predeterminado;
    try {
      const valor = localStorage.getItem(clave);
      return valor ? JSON.parse(valor) as T : predeterminado;
    } catch {
      localStorage.removeItem(clave);
      return predeterminado;
    }
  }

  private persistirVentas(): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VENTAS_KEY, JSON.stringify(this.ventas()));
  }

  private numeroPositivo(valor: number): number {
    return Number.isFinite(Number(valor)) && Number(valor) > 0 ? Number(valor) : 0;
  }

  private crearId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
