import { TestBed } from '@angular/core/testing';
import { Reportes } from './reportes';

describe('Reportes', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({ imports: [Reportes] }).compileComponents();
    const fixture = TestBed.createComponent(Reportes);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
