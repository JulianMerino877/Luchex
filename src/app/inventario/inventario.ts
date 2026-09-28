import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { filtrarProductos, Producto, ProductosService } from './productos.service';
import { QrScanner } from './qr-scanner/qr-scanner';

@Component({
  selector: 'app-inventario',
  imports: [DatePipe, ReactiveFormsModule, QrScanner],
  templateUrl: './inventario.html',
  styleUrl: './inventario.css',
})
export class Inventario implements OnDestroy {
  @ViewChild('dialogo', { static: true }) private dialogo!: ElementRef<HTMLDialogElement>;
  @ViewChild('nombreInput', { static: true }) private nombreInput!: ElementRef<HTMLInputElement>;
  protected readonly productos = inject(ProductosService);
  protected readonly busqueda = signal('');
  protected readonly resultados = computed(() => filtrarProductos(this.productos.productos(), this.busqueda()));
  protected readonly abierto = signal(false);
  protected readonly escaneando = signal(false);
  protected readonly escaneado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected readonly errorAccion = signal('');
  protected readonly aviso = signal('');
  protected readonly avisoFlotante = signal('');
  protected readonly editando = signal<Producto | null>(null);
  protected readonly eliminando = signal('');
  private temporizadorAviso?: number;
  ngOnDestroy(): void {
    if (this.temporizadorAviso !== undefined) window.clearTimeout(this.temporizadorAviso);
  }
  protected readonly form = new FormBuilder().nonNullable.group({
    codigo: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(4096)]],
    nombre: ['', [Validators.maxLength(120)]],
    total: [1, [Validators.required, Validators.min(0), Validators.max(999999), Validators.pattern(/^\d+$/)]],
  });

  protected abrir(): void {
    this.form.reset();
    this.editando.set(null);
    this.error.set('');
    this.errorAccion.set('');
    this.aviso.set('');
    this.escaneado.set(false);
    this.abierto.set(true);
    this.escaneando.set(true);
    this.dialogo.nativeElement.showModal();
  }

  protected editar(producto: Producto): void {
    this.form.setValue({ codigo: producto.codigo, nombre: producto.nombre, total: producto.total });
    this.editando.set(producto);
    this.error.set('');
    this.errorAccion.set('');
    this.aviso.set('');
    this.escaneado.set(false);
    this.escaneando.set(false);
    this.abierto.set(true);
    this.dialogo.nativeElement.showModal();
  }

  protected cerrar(event?: Event): void {
    event?.preventDefault();
    if (this.guardando()) return;
    this.escaneando.set(false);
    this.abierto.set(false);
    this.dialogo.nativeElement.close();
    this.editando.set(null);
  }

  protected async eliminar(producto: Producto): Promise<void> {
    if (this.eliminando()) return;
    this.eliminando.set(producto.id);
    this.errorAccion.set('');
    this.aviso.set('');
    try {
      await this.productos.eliminar(producto.id);
      this.mostrarAvisoFlotante(`Producto "${producto.nombre || producto.codigo.trim()}" eliminado correctamente.`);
    } catch (error) {
      this.errorAccion.set(this.productos.mensajeError(error));
    } finally {
      this.eliminando.set('');
    }
  }

  private mostrarAvisoFlotante(mensaje: string): void {
    if (this.temporizadorAviso !== undefined) window.clearTimeout(this.temporizadorAviso);
    this.avisoFlotante.set(mensaje);
    this.temporizadorAviso = window.setTimeout(() => {
      this.avisoFlotante.set('');
      this.temporizadorAviso = undefined;
    }, 3000);
  }

  protected escribirCodigo(): void {
    this.escaneando.set(false);
    this.escaneado.set(false);
  }

  protected recibirCodigo(codigo: string): void {
    this.escaneando.set(false);
    this.form.controls.codigo.setValue(codigo);
    this.form.controls.codigo.markAsTouched();
    this.escaneado.set(true);
    this.error.set('');
    this.nombreInput.nativeElement.focus();
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.escaneando.set(false);
    this.guardando.set(true);
    const { codigo, nombre, total } = this.form.getRawValue();
    const productoEditado = this.editando();
    this.form.disable();
    try {
      if (productoEditado) {
        await this.productos.actualizar(productoEditado.id, codigo, nombre, total);
      } else {
        await this.productos.agregar(codigo, nombre, total);
      }
      this.guardando.set(false);
      this.cerrar();
      this.busqueda.set('');
      this.aviso.set(`Producto ${codigo.trim()} ${productoEditado ? 'actualizado' : 'agregado'} en el inventario.`);
    } catch (error) {
      this.error.set(this.productos.mensajeError(error));
    } finally {
      this.guardando.set(false);
      this.form.enable();
    }
  }
}
