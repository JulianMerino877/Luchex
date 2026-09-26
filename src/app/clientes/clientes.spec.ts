import { TestBed } from '@angular/core/testing';
import { Clientes } from './clientes';

describe('Clientes', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({ imports: [Clientes] }).compileComponents();
    const fixture = TestBed.createComponent(Clientes);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
