import { Component, OnDestroy, output, signal } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Inventario } from './inventario';
import { CodigoDuplicadoError, filtrarProductos, Producto, ProductosService } from './productos.service';
import { QrScanner } from './qr-scanner/qr-scanner';

@Component({ selector: 'app-qr-scanner', template: '' })
class ScannerDoble implements OnDestroy {
  readonly codigoDetectado = output<string>();
  readonly detener = jasmine.createSpy('detener');
  ngOnDestroy(): void { this.detener(); }
}

describe('Inventario', () => {
  let fixture: ComponentFixture<Inventario>;
  let servicio: {
    productos: ReturnType<typeof signal<Producto[]>>;
    cargando: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string>>;
    agregar: jasmine.Spy;
    actualizar: jasmine.Spy;
    eliminar: jasmine.Spy;
    cargar: jasmine.Spy;
    mensajeError: (error: Error) => string;
  };
  const productos: Producto[] = [
    { id: '1', codigo: 'FRE-001', nombre: 'Pastillas de freno', total: 12, creado: new Date('2026-09-18T12:00:00Z') },
    { id: '2', codigo: 'BUJ-002', nombre: 'Bujía', total: 5, creado: null },
    { id: '3', codigo: 'ABC-003', nombre: '', total: 0, creado: null },
  ];

  beforeEach(async () => {
    servicio = {
      productos: signal([...productos]), cargando: signal(false), error: signal(''),
      agregar: jasmine.createSpy('agregar').and.resolveTo(),
      actualizar: jasmine.createSpy('actualizar').and.resolveTo(),
      eliminar: jasmine.createSpy('eliminar').and.resolveTo(),
      cargar: jasmine.createSpy('cargar'),
      mensajeError: error => error.message,
    };
    await TestBed.configureTestingModule({
      imports: [Inventario], providers: [{ provide: ProductosService, useValue: servicio }],
    }).overrideComponent(Inventario, {
      remove: { imports: [QrScanner] }, add: { imports: [ScannerDoble] },
    }).compileComponents();
    fixture = TestBed.createComponent(Inventario);
    fixture.detectChanges();
  });

  const input = (selector: string, value: string) => {
    const element: HTMLInputElement = fixture.nativeElement.querySelector(selector);
    element.value = value;
    element.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const abrir = () => {
    (fixture.nativeElement.querySelector('.page-header button') as HTMLButtonElement).click();
    fixture.detectChanges();
  };
  const guardar = async () => {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('busca por código o nombre sin distinguir mayúsculas ni tildes', () => {
    expect(filtrarProductos(productos, ' fre-001 ')).toEqual([productos[0]]);
    expect(filtrarProductos(productos, 'BUJIA')).toEqual([productos[1]]);
    expect(filtrarProductos(productos, '   ').length).toBe(3);
    input('.search input', 'bujia');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('BUJ-002');
  });

  it('muestra productos sin nombre y un estado cuando no hay coincidencias', () => {
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Sin nombre');
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('12');
    input('.search input', 'inexistente');
    expect(fixture.nativeElement.textContent).toContain('No encontramos ese producto');
  });

  it('completa el código desde el QR y permite guardar sin nombre', async () => {
    abrir();
    const scanner: ScannerDoble = fixture.debugElement.query(By.directive(ScannerDoble)).componentInstance;
    scanner.codigoDetectado.emit('QR-123/ABC');
    fixture.detectChanges();
    expect(scanner.detener).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#product-code').value).toBe('QR-123/ABC');
    await guardar();
    expect(servicio.agregar).toHaveBeenCalledOnceWith('QR-123/ABC', '', 1);
    expect(fixture.nativeElement.querySelector('dialog').open).toBeFalse();
    expect(fixture.nativeElement.querySelector('.success').textContent).toContain('QR-123/ABC');
  });

  it('rechaza códigos vacíos, con solo espacios o demasiado largos', async () => {
    abrir();
    for (const codigo of ['', '   ', 'x'.repeat(4097)]) {
      input('#product-code', codigo);
      await guardar();
    }
    expect(servicio.agregar).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('dialog').open).toBeTrue();
  });

  it('conserva los datos del formulario cuando el código ya existe', async () => {
    servicio.agregar.and.rejectWith(new CodigoDuplicadoError());
    abrir();
    input('#product-code', 'FRE-001');
    input('#product-name', 'Freno');
    await guardar();
    expect(fixture.nativeElement.querySelector('dialog').open).toBeTrue();
    expect(fixture.nativeElement.querySelector('#product-name').value).toBe('Freno');
    expect(fixture.nativeElement.querySelector('.failure').textContent).toContain('Ya existe');
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBeFalse();
  });

  it('detiene el escáner al cerrar con Escape y no registra ningún producto', () => {
    abrir();
    const scanner: ScannerDoble = fixture.debugElement.query(By.directive(ScannerDoble)).componentInstance;
    fixture.nativeElement.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(scanner.detener).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('dialog').open).toBeFalse();
    expect(servicio.agregar).not.toHaveBeenCalled();
  });

  it('permite escribir y guardar en el mismo formulario, deteniendo la cámara', async () => {
    abrir();
    const scanner: ScannerDoble = fixture.debugElement.query(By.directive(ScannerDoble)).componentInstance;
    expect(fixture.nativeElement.querySelector('.entry-options')).toBeNull();
    input('#product-code', 'MANUAL-123');
    input('#product-total', '25');
    expect(scanner.detener).toHaveBeenCalled();
    expect(fixture.debugElement.query(By.directive(ScannerDoble))).toBeNull();
    await guardar();
    expect(servicio.agregar).toHaveBeenCalledOnceWith('MANUAL-123', '', 25);
  });

  it('permite volver a escanear conservando el nombre opcional', () => {
    abrir();
    input('#product-name', 'Pastillas');
    input('#product-code', 'MANUAL-123');
    fixture.nativeElement.querySelector('.rescan').click();
    fixture.detectChanges();
    const scanner: ScannerDoble = fixture.debugElement.query(By.directive(ScannerDoble)).componentInstance;
    scanner.codigoDetectado.emit('QR-456');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#product-code').value).toBe('QR-456');
    expect(fixture.nativeElement.querySelector('#product-name').value).toBe('Pastillas');
  });

  it('edita un producto desde el botón de acción', async () => {
    (fixture.nativeElement.querySelector('[title="Editar producto"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#product-code').value).toBe('FRE-001');
    expect(fixture.nativeElement.querySelector('app-qr-scanner')).toBeNull();
    input('#product-name', 'Pastillas delanteras');
    input('#product-total', '20');
    await guardar();
    expect(servicio.actualizar).toHaveBeenCalledOnceWith('1', 'FRE-001', 'Pastillas delanteras', 20);
  });

  it('elimina un producto y oculta su aviso flotante después de tres segundos', fakeAsync(() => {
    (fixture.nativeElement.querySelector('[title="Eliminar producto"]') as HTMLButtonElement).click();
    tick();
    fixture.detectChanges();
    expect(servicio.eliminar).toHaveBeenCalledOnceWith('1');
    expect(fixture.nativeElement.querySelector('.product-toast').textContent).toContain('Producto "Pastillas de freno" eliminado correctamente');
    tick(3000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.product-toast')).toBeNull();
  }));

  it('muestra los errores de lectura y permite reintentar', () => {
    servicio.error.set('Sin permiso para acceder a los productos.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Sin permiso');
    fixture.nativeElement.querySelector('.empty-state button').click();
    expect(servicio.cargar).toHaveBeenCalled();
  });
});
