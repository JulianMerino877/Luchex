import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TallerDataService } from '../taller/taller-data.service';
import { MetodoPago, OrdenTrabajo, Venta, totalOrden, totalProductos } from '../taller/taller.models';

@Component({
  selector: 'app-ventas',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class Ventas implements OnDestroy {
  private readonly data = inject(TallerDataService);
  private readonly route = inject(ActivatedRoute);

  protected readonly ventas = computed(() => [...this.data.ventas()].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)));
  protected readonly busqueda = signal('');
  protected readonly ventasFiltradas = computed(() => {
    const termino = this.busqueda().trim().toLocaleLowerCase('es');
    if (!termino) return this.ventas();
    return this.ventas().filter(venta => [
      venta.folio, this.clienteDe(venta), this.conceptoDe(venta), this.nombreMetodo(venta),
    ].some(valor => valor.toLocaleLowerCase('es').includes(termino)));
  });
  protected readonly seleccionadaId = signal(this.route.snapshot.queryParamMap.get('venta') ?? '');
  protected readonly ventaSeleccionada = computed(() =>
    this.data.ventas().find(venta => venta.id === this.seleccionadaId()) ?? this.ventas()[0] ?? null);
  protected readonly ordenSeleccionada = computed(() => {
    const ordenId = this.ventaSeleccionada()?.ordenId;
    return ordenId ? this.data.ordenes().find(orden => orden.id === ordenId) ?? null : null;
  });
  protected readonly creandoVenta = signal(false);
  protected readonly clienteNuevo = signal('');
  protected readonly mostrarServicios = signal(false);
  protected readonly metodoPago = signal<MetodoPago>('efectivo');
  protected readonly aviso = signal('');        // Mensaje verde flotante sobre la tabla (3 s)
  protected readonly errorAccion = signal('');  // Error en rojo arriba de la tabla
  private temporizadorAviso?: ReturnType<typeof setTimeout>;

  // ---------------------------------------------------------------------------------
  // Paginación (igual que en Mecánicos): 5 ventas por página con flechas ‹ ›
  // ---------------------------------------------------------------------------------
  protected readonly porPagina = 5;
  protected readonly pagina = signal(1);
  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.ventasFiltradas().length / this.porPagina)));
  /** Evita quedar en una página que ya no existe (por ejemplo, después de buscar). */
  protected readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  /** Las ventas de la página actual. */
  protected readonly ventasPagina = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.ventasFiltradas().slice(inicio, inicio + this.porPagina);
  });
  /** Números para el texto "Mostrando 1–5 de 12 ventas". */
  protected readonly primerResultado = computed(() =>
    this.ventasFiltradas().length ? (this.paginaActual() - 1) * this.porPagina + 1 : 0);
  protected readonly ultimoResultado = computed(() =>
    Math.min(this.paginaActual() * this.porPagina, this.ventasFiltradas().length));
  /** Ventas que todavía no se cobran (para la etiqueta del título). */
  protected readonly pendientes = computed(() => this.data.ventas().filter(venta => venta.estado === 'pendiente').length);

  ngOnDestroy(): void {
    clearTimeout(this.temporizadorAviso);
  }

  /** Cambia la búsqueda y vuelve a la página 1. */
  protected buscar(texto: string): void {
    this.busqueda.set(texto);
    this.pagina.set(1);
  }

  /** Aviso verde flotante sobre la tabla: se oculta solo a los 3 segundos (igual que Mecánicos). */
  private mostrarAviso(mensaje: string): void {
    clearTimeout(this.temporizadorAviso);
    this.errorAccion.set('');
    this.aviso.set(mensaje);
    this.temporizadorAviso = setTimeout(() => this.aviso.set(''), 3000);
  }

  /** Error en el recuadro rojo de arriba (se queda hasta que el usuario lo cierre). */
  private mostrarError(mensaje: string): void {
    clearTimeout(this.temporizadorAviso);
    this.aviso.set('');
    this.errorAccion.set(mensaje);
  }
  protected readonly fechaActual = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date());
  protected readonly recaudadoHoy = computed(() => this.ventasPagadasEnPeriodo('dia')
    .reduce((total, venta) => total + this.totalVenta(venta), 0));
  protected readonly recaudadoMes = computed(() => this.ventasPagadasEnPeriodo('mes')
    .reduce((total, venta) => total + this.totalVenta(venta), 0));
  protected readonly cantidadMes = computed(() => {
    const hoy = new Date();
    return this.data.ventas().filter(venta => {
      const fecha = new Date(venta.fecha);
      return fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear();
    }).length;
  });

  protected seleccionar(venta: Venta): void {
    this.seleccionadaId.set(venta.id);
    this.mostrarServicios.set(false);
    this.metodoPago.set(venta.metodoPago ?? 'efectivo');
    this.errorAccion.set('');
  }

  protected crearVentaDirecta(): void {
    const cliente = this.clienteNuevo().trim();
    if (!cliente) {
      this.mostrarError('Ingresa el nombre del cliente para crear la venta.');
      return;
    }
    const venta = this.data.crearVentaDirecta(cliente);
    this.seleccionadaId.set(venta.id);
    this.clienteNuevo.set('');
    this.creandoVenta.set(false);
    this.mostrarAviso('Venta directa creada. Agrega los productos que comprará el cliente.');
  }

  protected agregarProducto(): void {
    const venta = this.ventaSeleccionada();
    if (!venta || venta.estado === 'pagada') return;
    this.data.agregarProductoVacio(venta.id);
  }

  protected actualizarProducto(
    productoId: string,
    campo: 'nombre' | 'cantidad' | 'precioUnitario',
    valor: string | number,
  ): void {
    const venta = this.ventaSeleccionada();
    if (!venta || venta.estado === 'pagada') return;
    this.data.actualizarProducto(venta.id, productoId, campo, valor);
  }

  protected quitarProducto(productoId: string): void {
    const venta = this.ventaSeleccionada();
    if (!venta || venta.estado === 'pagada') return;
    this.data.quitarProducto(venta.id, productoId);
  }

  protected guardarCambios(): void {
    const venta = this.ventaSeleccionada();
    if (!venta) return;
    if (venta.estado === 'pendiente') this.data.actualizarMetodoPago(venta.id, this.metodoPago());
    this.mostrarAviso('Cambios de la venta guardados correctamente.');
    this.seleccionadaId.set('');
  }

  protected async marcarComoPagado(): Promise<void> {
    const venta = this.ventaSeleccionada();
    if (!venta || venta.estado === 'pagada' || this.totalVenta(venta) <= 0) return;
    const metodo = this.metodoPago();
    if (!metodo) return;
    try {
      await this.data.registrarPago(venta.id, metodo);
      this.mostrarAviso(venta.ordenId
        ? 'Venta marcada como pagada. La orden asociada cambió automáticamente a Pagado.'
        : 'Venta marcada como pagada correctamente.');
      this.seleccionadaId.set('');
    } catch (error) {
      this.mostrarError(error instanceof Error ? error.message : 'No se pudo registrar el pago.');
    }
  }

  protected async modificarVenta(): Promise<void> {
    const venta = this.ventaSeleccionada();
    if (!venta || venta.estado !== 'pagada') return;
    try {
      await this.data.reabrirVenta(venta.id);
      this.metodoPago.set('efectivo');
      this.mostrarAviso('La venta está habilitada nuevamente para modificarla.');
    } catch (error) {
      this.mostrarError(error instanceof Error ? error.message : 'No se pudo modificar la venta.');
    }
  }

  protected ordenDe(venta: Venta): OrdenTrabajo | null {
    return venta.ordenId ? this.data.ordenes().find(orden => orden.id === venta.ordenId) ?? null : null;
  }

  protected clienteDe(venta: Venta): string {
    return this.ordenDe(venta)?.cliente ?? venta.cliente;
  }

  protected conceptoDe(venta: Venta): string {
    const orden = this.ordenDe(venta);
    if (orden) return `Orden de servicio ${this.folioVisible(orden.folio)}`;
    if (venta.productos.length) return venta.productos.map(producto => producto.nombre).join(', ');
    return 'Venta directa';
  }

  protected tipoContenidoDe(venta: Venta): string {
    const tieneServicio = !!venta.ordenId;
    const tieneProducto = venta.productos.length > 0;
    if (tieneServicio && tieneProducto) return 'Servicio, producto';
    return tieneServicio ? 'Servicio' : 'Producto';
  }

  protected nombreMetodo(venta: Venta): string {
    if (venta.estado !== 'pagada') return 'Pendiente';
    const nombres: Record<MetodoPago, string> = {
      efectivo: 'Efectivo', yape: 'Yape', transferencia: 'Transferencia',
    };
    return venta.metodoPago ? nombres[venta.metodoPago] : 'Pendiente';
  }

  protected totalVenta(venta: Venta): number {
    const orden = this.ordenDe(venta);
    return (orden ? totalOrden(orden) : 0) + totalProductos(venta);
  }

  protected subtotalOrden(orden: OrdenTrabajo): number {
    return totalOrden(orden);
  }

  protected subtotalProducto(cantidad: number, precio: number): number {
    return cantidad * precio;
  }

  protected folioVisible(folio: string): string {
    const numero = folio.match(/(\d+)$/)?.[1];
    return numero ? `N.º ${Number(numero).toString().padStart(3, '0')}` : folio;
  }

  private ventasPagadasEnPeriodo(periodo: 'dia' | 'mes'): Venta[] {
    const hoy = new Date();
    return this.data.ventas().filter(venta => {
      if (venta.estado !== 'pagada' || !venta.pagadaEn) return false;
      const fecha = new Date(venta.pagadaEn);
      const mismoMes = fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear();
      return mismoMes && (periodo === 'mes' || fecha.getDate() === hoy.getDate());
    });
  }
}
