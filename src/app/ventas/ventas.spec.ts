import { TestBed } from '@angular/core/testing';
import { Ventas } from './ventas';

describe('Ventas', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({ imports: [Ventas] }).compileComponents();
    const fixture = TestBed.createComponent(Ventas);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
