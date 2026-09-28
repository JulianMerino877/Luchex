export type EstadoOrden = 'pendiente' | 'proceso' | 'listo' | 'pagado';
export type EstadoVenta = 'pendiente' | 'pagada';
export type MetodoPago = 'efectivo' | 'yape' | 'transferencia';

export interface ServicioOrden {
  id: string;
  nombre: string;
  precio: number;
}

export interface OrdenTrabajo {
  id: string;
  folio: string;
  cliente: string;
  moto: string;
  estado: EstadoOrden;
  observaciones: string;
  servicios: ServicioOrden[];
  manoObra: number;
  fecha: string;
}

export interface ProductoVenta {
  id: string;
  productoId?: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Venta {
  id: string;
  folio: string;
  ordenId: string | null;
  cliente: string;
  moto: string;
  productos: ProductoVenta[];
  estado: EstadoVenta;
  metodoPago: MetodoPago | null;
  fecha: string;
  pagadaEn: string | null;
}

export function totalServicios(orden: OrdenTrabajo): number {
  return orden.servicios.reduce((total, servicio) => total + numeroPositivo(servicio.precio), 0);
}

export function totalOrden(orden: OrdenTrabajo): number {
  return totalServicios(orden) + numeroPositivo(orden.manoObra);
}

export function totalProductos(venta: Venta): number {
  return venta.productos.reduce((total, producto) =>
    total + numeroPositivo(producto.cantidad) * numeroPositivo(producto.precioUnitario), 0);
}

function numeroPositivo(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}
