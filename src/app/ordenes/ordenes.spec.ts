import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Ordenes } from './ordenes';

describe('Órdenes: listado', () => {
  let fixture: ComponentFixture<Ordenes>;
  let lectura: jasmine.Spy;
  let escritura: jasmine.Spy;
  const orden = {
    id: 'existente', folio: 'OT-2026-001', cliente: 'rojas', moto: 'rojo',
    estado: 'pendiente', observaciones: 'Conservar observaciones',
    servicios: [{ id: 'servicio', nombre: 'Cambio de aceite', precio: 35 }],
    manoObra: 20, fecha: '2026-09-20T12:00:00Z',
  };

  beforeEach(async () => {
    lectura = spyOn(Storage.prototype, 'getItem').and.returnValue(JSON.stringify([orden]));
    escritura = spyOn(Storage.prototype, 'setItem');
    await TestBed.configureTestingModule({ imports: [Ordenes], providers: [provideRouter([])] }).compileComponents();
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
    expect(escritura).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.edit-button').click();
    fixture.detectChanges();
    tick();
    expect(fixture.nativeElement.querySelector('textarea').value).toBe(orden.observaciones);
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(JSON.parse(escritura.calls.mostRecent().args[1])).toEqual([orden]);
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
    expect(escritura).not.toHaveBeenCalled();
  });

  it('cambia el estado en ciclo y guarda cada cambio', () => {
    abrir();
    const estado = (): HTMLButtonElement => fixture.nativeElement.querySelector('.status-badge');

    estado().click();
    fixture.detectChanges();
    expect(estado().textContent?.trim()).toBe('En proceso');
    expect(estado().dataset['status']).toBe('proceso');
    expect(JSON.parse(escritura.calls.mostRecent().args[1])[0].estado).toBe('proceso');
    expect(fixture.nativeElement.querySelector('.notice').textContent).toContain('Estado de OT#1 cambiado a En proceso.');

    estado().click();
    fixture.detectChanges();
    expect(estado().textContent?.trim()).toBe('Listo');
    expect(estado().dataset['status']).toBe('listo');
    expect(JSON.parse(escritura.calls.mostRecent().args[1])[0].estado).toBe('listo');

    estado().click();
    fixture.detectChanges();
    expect(estado().textContent?.trim()).toBe('Pendiente');
    expect(estado().dataset['status']).toBe('pendiente');
    expect(JSON.parse(escritura.calls.mostRecent().args[1])[0].estado).toBe('pendiente');
    expect(escritura).toHaveBeenCalledTimes(3);
  });

  it('pagina los resultados y vuelve a la primera página al buscar', () => {
    lectura.and.returnValue(JSON.stringify(Array.from({ length: 13 }, (_, i) => ({
      ...orden, id: String(i), folio: `OT-${i}`, cliente: `Cliente ${i}`,
      fecha: `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    }))));
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
    expect(escritura).not.toHaveBeenCalled();
  });
});
