import { TestBed } from '@angular/core/testing';
import { Inventario } from './inventario';

describe('Inventario', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({ imports: [Inventario] }).compileComponents();
    const fixture = TestBed.createComponent(Inventario);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
