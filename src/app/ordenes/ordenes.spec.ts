import { signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Ordenes } from './ordenes';
import { OrdenesService } from './ordenes.service';
import { OrdenTrabajo } from '../taller/taller.models';

describe('Órdenes: listado', () => {
  let fixture: ComponentFixture<Ordenes>;
  let ordenesSignal: ReturnType<typeof signal<OrdenTrabajo[]>>;
  let guardar: jasmine.Spy;
  let actualizar: jasmine.Spy;
  const orden: OrdenTrabajo = {
    id: 'existente', folio: 'OT-2026-001', cliente: 'rojas', telefono: '', moto: 'rojo',
    estado: 'pendiente', observaciones: 'Conservar observaciones',
    servicios: [{ id: 'servicio', nombre: 'Cambio de aceite', precio: 35 }],
    manoObra: 20, fecha: '2026-09-20T12:00:00Z',
  };

  beforeEach(async () => {
    ordenesSignal = signal([orden]);
    guardar = jasmine.createSpy('guardar').and.callFake(async (guardada: OrdenTrabajo, editando: boolean) => {
      ordenesSignal.update(lista => editando
        ? lista.map(item => item.id === guardada.id ? guardada : item)
        : [guardada, ...lista]);
    });
    actualizar = jasmine.createSpy('actualizar').and.callFake(async (actualizada: OrdenTrabajo) => {
      ordenesSignal.update(lista => lista.map(item => item.id === actualizada.id ? actualizada : item));
    });
    await TestBed.configureTestingModule({
      imports: [Ordenes],
      providers: [
        provideRouter([]),
        { provide: OrdenesService, useValue: {
          ordenes: ordenesSignal, cargando: signal(false), error: signal(''), guardar, actualizar,
        } },
      ],
    }).compileComponents();
  });

  function abrir(): void {
    fixture = TestBed.createComponent(Ordenes);
    fixture.detectChanges();
  }

  function buscar(valor: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('conserva la orden y desvanece el aviso después de 2 segundos', fakeAsync(() => {
    abrir();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.order-folio').textContent).toBe('OT#1');
    expect(fixture.nativeElement.querySelector('.table-footer').textContent).toContain('Mostrando 1 de 1 orden');
    expect(guardar).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.edit-button').click();
    fixture.detectChanges();
    tick();
    expect(fixture.nativeElement.querySelector('textarea').value).toBe(orden.observaciones);
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    flushMicrotasks();
    fixture.detectChanges();
    expect(guardar).toHaveBeenCalledWith(orden, true);
    expect(fixture.nativeElement.querySelector('.notice').textContent).toContain('Orden OT#1 actualizada correctamente.');
    tick(1999);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notice')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.notice.fading')).toBeNull();
    tick(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notice.fading')).not.toBeNull();
    tick(300);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notice')).toBeNull();
  }));

  it('combina búsqueda por servicio con filtros y no cambia las órdenes almacenadas', () => {
    abrir();
    buscar('ACEITE');
    expect(fixture.nativeElement.querySelector('.edit-button')).not.toBeNull();
    fixture.nativeElement.querySelectorAll('.status-filters button')[2].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.edit-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.table-footer').textContent).toContain('Mostrando 0 de 0 órdenes');
    fixture.nativeElement.querySelectorAll('.status-filters button')[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.edit-button')).not.toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('cambia el estado en ciclo y guarda cada cambio', fakeAsync(() => {
    abrir();
    const estado = (): HTMLButtonElement => fixture.nativeElement.querySelector('.status-badge');

    estado().click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(estado().textContent?.trim()).toBe('En proceso');
    expect(estado().dataset['status']).toBe('proceso');
    expect(actualizar.calls.mostRecent().args[0].estado).toBe('proceso');
    expect(fixture.nativeElement.querySelector('.notice').textContent).toContain('Estado de OT#1 cambiado a En proceso.');

    estado().click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(estado().textContent?.trim()).toBe('Listo');
    expect(estado().dataset['status']).toBe('listo');
    expect(actualizar.calls.mostRecent().args[0].estado).toBe('listo');

    estado().click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(estado().textContent?.trim()).toBe('Pendiente');
    expect(estado().dataset['status']).toBe('pendiente');
    expect(actualizar.calls.mostRecent().args[0].estado).toBe('pendiente');
    expect(actualizar).toHaveBeenCalledTimes(3);
  }));

  it('pagina los resultados y vuelve a la primera página al buscar', () => {
    ordenesSignal.set(Array.from({ length: 13 }, (_, i) => ({
      ...orden, id: String(i), folio: `OT-${i}`, cliente: `Cliente ${i}`,
      fecha: `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    })));
    abrir();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(12);
    expect(fixture.nativeElement.querySelector('tbody tr').textContent).toContain('OT#12');
    fixture.nativeElement.querySelectorAll('.pagination button')[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.current-page').textContent).toBe('2');
    buscar('Cliente 12');
    expect(fixture.nativeElement.querySelector('.current-page').textContent).toBe('1');
    expect(fixture.nativeElement.querySelector('tbody tr').textContent).toContain('OT#12');
    expect(guardar).not.toHaveBeenCalled();
  });
});
