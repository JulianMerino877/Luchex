import { TestBed } from '@angular/core/testing';
import { Caja } from './caja';

describe('Caja', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({ imports: [Caja] }).compileComponents();
    const fixture = TestBed.createComponent(Caja);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
